'use server';

// import { RESUME_IMPORTER_SYSTEM_MESSAGE, } from "@/lib/prompts";
import { Resume } from "@/lib/types";
import { textImportSchema, workExperienceBulletPointsSchema } from "@/lib/zod-schemas";
import { buildLabelledResumeText } from "@/lib/resume-sections";
import { generateObject, type LanguageModelUsage, type LanguageModelV1, type TelemetrySettings } from "ai";
import { z } from "zod";
import { type AIConfig } from '@/utils/ai-tools';
import { getSubscriptionPlan } from "@/utils/actions/stripe/actions";
import { PROJECT_GENERATOR_MESSAGE, PROJECT_IMPROVER_MESSAGE, TEXT_ANALYZER_SYSTEM_MESSAGE, WORK_EXPERIENCE_GENERATOR_MESSAGE, WORK_EXPERIENCE_IMPROVER_MESSAGE } from "@/lib/prompts";
import { projectAnalysisSchema, workExperienceItemsSchema } from "@/lib/zod-schemas";
import { WorkExperience } from "@/lib/types";
import { withTaskModel } from "@/lib/ai/task-models";
import {
  finishAIUsageRequest,
  startAIUsageRequest,
} from "@/lib/ai/usage-ledger";

async function getAIPlanState() {
  const { plan, id } = await getSubscriptionPlan(true);
  return {
    isPro: plan === 'pro',
    userId: id,
  };
}

async function runTrackedAIRequest<T extends { usage?: LanguageModelUsage }>(
  input: {
    route: string;
    userId: string;
    isPro: boolean;
    config?: AIConfig;
    useThinking?: boolean;
  },
  task: (model: LanguageModelV1, telemetry: TelemetrySettings) => Promise<T>
) {
  const { model, usageEventId, telemetry } = await startAIUsageRequest(input);

  try {
    const result = await task(model, telemetry);
    await finishAIUsageRequest({
      usageEventId,
      status: 'succeeded',
      usage: result.usage,
    });
    return result;
  } catch (error) {
    await finishAIUsageRequest({
      usageEventId,
      status: 'failed',
      errorCode: error instanceof Error ? error.message : 'ai_request_failed',
    });
    throw error;
  }
}

// Base Resume Creation
// TEXT CONTENT -> RESUME
export async function convertTextToResume(prompt: string, existingResume: Resume, targetRole: string, config?: AIConfig) {
  const { isPro, userId } = await getAIPlanState();
  const resolvedConfig = withTaskModel({
    task: "structuredExtraction",
    isPro,
    config,
  });

  // Split the resume on its own printed headings before the model sees it.
  // Deciding which schema array a line belongs to is the part small models get
  // wrong; the headings answer that exactly, for free.
  const { labelled, hasExperience, hasProjects, experienceBlock } =
    buildLabelledResumeText(prompt);

  let object: { content: z.infer<typeof textImportSchema> };
  try {
    const result = await runTrackedAIRequest(
      {
        route: 'actions.resumes.convertTextToResume',
        userId,
        isPro,
        config: resolvedConfig,
        useThinking: isPro,
      },
      (aiClient, telemetry) => generateObject({
        model: aiClient,
        maxRetries: 0,
        experimental_telemetry: telemetry,
        schema: z.object({
          content: textImportSchema
        }),
        system: `You are ResumeFormatter, an expert system specialized in analyzing complete resumes and converting them into a structured JSON object tailored for targeted job applications.

        Your task is to transform the complete resume text into a JSON object according to the provided schema. You will identify and extract the most relevant experiences, skills, projects, and educational background based on the target role. While doing so, you are allowed to make minimal formatting changes only to enhance clarity and highlight relevance—**do not reword, summarize, or alter the core details of any content.**

        CRITICAL DIRECTIVES:
        1. **Analysis & Selection:**
          - Analyze the full resume text that includes all user experiences, skills, projects, and education.
          - Identify the items that best match the target role: ${targetRole}.
          - Always include the education section:
            - If only one educational entry exists, include it.
            - If multiple entries exist, select the one(s) most relevant to the target role.

        2. **Section mapping — the most common failure, read carefully:**
          - The resume's own headings are authoritative. Text under EXPERIENCE, WORK EXPERIENCE or EMPLOYMENT is work_experience, even when a bullet describes a project the person built.
          - work_experience = a role held at an employer: a job title, a company, and dates. **Every bullet under one job belongs to that same entry's description array.** Never turn individual bullets into separate entries, and never move them into projects.
          - projects = named, standalone work under its own PROJECTS heading — personal, academic or open-source work not performed for an employer.
          - If the resume has no separate projects section, return an empty projects array. Do not manufacture one by moving job bullets into it.
          - Keep every employer from the resume, in the original order, one entry per role.

        3. **Formatting & Emphasis:**
          - Transform the resume into a JSON object following the schema, with sections such as basic information, professional experience, projects, skills, and education.
          - Preserve all original details, dates, and descriptions. Only modify the text for formatting purposes.
          - **Enhance relevance by marking keywords** within work experience descriptions, project details, achievements, and education details with bold formatting (i.e., wrap them with two asterisks like **this**). Apply this only to keywords or phrases that are highly relevant to the target role.
          - Do not add any formatting to section titles or headers.
          - Use empty arrays ([]) for any sections that do not contain relevant items.

        4. **Output Requirements:**
          - The final output must be a valid JSON object that adheres to the specified schema.
          - Arrays must be real JSON arrays, never a string containing JSON.
          - Include only the most relevant items, optimized for the target role.
          - Do not add any new information or rephrase the provided content—only apply minor formatting (like bolding) to emphasize key points.
        `,
        prompt: `INPUT:
    The resume below has already been split on its own headings, and each block
    is labelled with the schema field it feeds. Follow those labels exactly —
    do not move content between sections.
${hasExperience ? `
    The EXPERIENCE block contains ${'`'}work_experience${'`'} entries. Emit one entry per
    job, with that job's bullets in its ${'`'}description${'`'} array.` : ''}${!hasProjects ? `
    This resume has NO projects section. Return ${'`'}"projects": []${'`'}. Do not create
    projects out of bullets that belong to a job.` : ''}

${labelled}

    Now, format this information into the JSON object according to the schema, ensuring it is optimized for the target role: ${targetRole}.`,
      })
    );
    object = result.object;
  } catch (error) {
    throw error;
  }

  // The resume's headings are ground truth, so anything the model inferred
  // that contradicts them is wrong by construction. A resume with no PROJECTS
  // heading has no projects; entries here are misfiled job bullets.
  if (!hasProjects && object.content.projects?.length) {
    object.content.projects = [];
  }

  // Last resort when the model still returned no jobs from a resume that
  // plainly has an experience section. One retry, one section, one field —
  // far easier than extracting the whole document at once.
  if (
    hasExperience &&
    experienceBlock &&
    !object.content.work_experience?.length
  ) {
    try {
      const recovered = await runTrackedAIRequest(
        {
          route: 'actions.resumes.convertTextToResume.workExperienceRetry',
          userId,
          isPro,
          config: resolvedConfig,
        },
        (aiClient, telemetry) => generateObject({
          model: aiClient,
          maxRetries: 0,
          experimental_telemetry: telemetry,
          schema: z.object({
            work_experience: textImportSchema.shape.work_experience,
          }),
          system:
            'You extract employment history. Every job in the text becomes one entry: ' +
            'company, position, date, and that job\'s bullets as the description array. ' +
            'Never split one job into several entries. Never omit a job. Output JSON only.',
          prompt: `Extract every job from this EXPERIENCE section:\n\n${experienceBlock}`,
        }),
      );

      if (recovered.object.work_experience?.length) {
        object.content.work_experience = recovered.object.work_experience;
      }
    } catch {
      // Keep whatever the first pass produced rather than failing the import.
    }
  }

  const updatedResume = {
    ...existingResume,
    ...(object.content.first_name && { first_name: object.content.first_name }),
    ...(object.content.last_name && { last_name: object.content.last_name }),
    ...(object.content.email && { email: object.content.email }),
    ...(object.content.phone_number && { phone_number: object.content.phone_number }),
    ...(object.content.location && { location: object.content.location }),
    ...(object.content.website && { website: object.content.website }),
    ...(object.content.linkedin_url && { linkedin_url: object.content.linkedin_url }),
    ...(object.content.github_url && { github_url: object.content.github_url }),
    
    work_experience: [...existingResume.work_experience, ...(object.content.work_experience || [])],
    education: [...existingResume.education, ...(object.content.education || [])],
    skills: [...existingResume.skills, ...(object.content.skills || [])],
    projects: [...existingResume.projects, ...(object.content.projects || [])],
  };

  
  return updatedResume;
}



    // NEW WORK EXPERIENCE BULLET POINTS
    export async function generateWorkExperiencePoints(
      position: string,
      company: string,
      technologies: string[],
      targetRole: string,
      numPoints: number = 3,
      customPrompt: string = '',
      config?: AIConfig,
      // Bullets already on this entry. Without them the prompt was byte-for-byte
      // identical on every click, so the model had no way to know anything had
      // been generated before — and returned the same bullets each time.
      existingPoints: string[] = [],
    ) {
      const { isPro, userId } = await getAIPlanState();
  
      // Use custom prompt if provided in config, otherwise fall back to default
      const systemPrompt = config?.customPrompts?.workExperienceGenerator 
        ?? (WORK_EXPERIENCE_GENERATOR_MESSAGE.content as string);

      const { object } = await runTrackedAIRequest({
        route: 'actions.resumes.generateWorkExperiencePoints',
        userId,
        isPro,
        config: withTaskModel({ task: "contentGeneration", isPro, config }),
      }, (aiClient, telemetry) => generateObject({
        model: aiClient,
        maxRetries: 0,
        experimental_telemetry: telemetry,
        schema: z.object({
          content: workExperienceBulletPointsSchema
        }),
      prompt: `Position: ${position}
      Company: ${company}
      Technologies: ${technologies.join(', ')}
      Target Role: ${targetRole}
      Number of Points: ${numPoints}${customPrompt ? `\nCustom Focus: ${customPrompt}` : ''}${
        existingPoints.length
          ? `

      ALREADY ON THIS ENTRY — do not repeat these, and do not rephrase them:
${existingPoints.map((point) => `      - ${point}`).join('\n')}

      Write ${numPoints} bullet point(s) covering DIFFERENT responsibilities,
      projects or outcomes from the ones above.`
          : ''
      }`,
        system: systemPrompt,
        // The prompt for a given entry is otherwise near-constant, and the
        // default sampling settings gave near-identical output on repeat
        // clicks. This is generation, not extraction — variety is the point.
        temperature: 0.8,
      }));

      // The model can still echo an existing bullet. Filter exact and
      // whitespace/case-insensitive repeats rather than showing the user a
      // "new" suggestion they already have.
      const seen = new Set(
        existingPoints.map((point) => point.trim().toLowerCase()),
      );
      const points = (object.content.points ?? []).filter((point) => {
        const key = point.trim().toLowerCase();
        if (key.length === 0 || seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      return { ...object.content, points };
      }
    
      // WORK EXPERIENCE BULLET POINTS IMPROVEMENT
      export async function improveWorkExperience(point: string, customPrompt?: string, config?: AIConfig) {
          const { isPro, userId } = await getAIPlanState();
          
          // Use custom prompt if provided in config, otherwise fall back to default
          const systemPrompt = config?.customPrompts?.workExperienceImprover 
            ?? (WORK_EXPERIENCE_IMPROVER_MESSAGE.content as string);

          const { object } = await runTrackedAIRequest({
          route: 'actions.resumes.improveWorkExperience',
          userId,
          isPro,
          config: withTaskModel({ task: "simpleRewrite", isPro, config }),
          }, (aiClient, telemetry) => generateObject({
          model: aiClient,
          maxRetries: 0,
          experimental_telemetry: telemetry,
          
          schema: z.object({
              content: z.string().describe("The improved work experience bullet point")
          }),
          prompt: `Please improve this work experience bullet point while maintaining its core message and truthfulness${customPrompt ? `. Additional requirements: ${customPrompt}` : ''}:\n\n"${point}"`,
          system: systemPrompt,
          }));
      

          return object.content;
      }
    
      // PROJECT BULLET POINTS IMPROVEMENT
      export async function improveProject(point: string, customPrompt?: string, config?: AIConfig) {
          
          const { isPro, userId } = await getAIPlanState();

          // Use custom prompt if provided in config, otherwise fall back to default
          const systemPrompt = config?.customPrompts?.projectImprover 
            ?? (PROJECT_IMPROVER_MESSAGE.content as string);
  
          const { object } = await runTrackedAIRequest({
          route: 'actions.resumes.improveProject',
          userId,
          isPro,
          config: withTaskModel({ task: "simpleRewrite", isPro, config }),
          }, (aiClient, telemetry) => generateObject({
          model: aiClient,
          maxRetries: 0,
          experimental_telemetry: telemetry,
          schema: z.object({
              content: z.string().describe("The improved project bullet point")
          }),
          prompt: `Please improve this project bullet point while maintaining its core message and truthfulness${customPrompt ? `. Additional requirements: ${customPrompt}` : ''}:\n\n"${point}"`,
          system: systemPrompt,
          }));
      
          return object.content;
      }
      
      // NEW PROJECT BULLET POINTS
      export async function generateProjectPoints(
          projectName: string,
          technologies: string[],
          targetRole: string,
          numPoints: number = 3,
          customPrompt: string = '',
          config?: AIConfig
      ) {
          const { isPro, userId } = await getAIPlanState();
          
          // Use custom prompt if provided in config, otherwise fall back to default
          const systemPrompt = config?.customPrompts?.projectGenerator 
            ?? (PROJECT_GENERATOR_MESSAGE.content as string);

          const { object } = await runTrackedAIRequest({
          route: 'actions.resumes.generateProjectPoints',
          userId,
          isPro,
          config: withTaskModel({ task: "contentGeneration", isPro, config }),
          }, (aiClient, telemetry) => generateObject({
          model: aiClient,
          maxRetries: 0,
          experimental_telemetry: telemetry,
          schema: z.object({
              content: projectAnalysisSchema
          }),
          prompt: `Project Name: ${projectName}
      Technologies: ${technologies.join(', ')}
      Target Role: ${targetRole}
      Number of Points: ${numPoints}${customPrompt ? `\nCustom Focus: ${customPrompt}` : ''}`,
          system: systemPrompt,
          }));
      
          return object.content;
      }
      
      // Text Import for profile
      export async function processTextImport(text: string, config?: AIConfig) {
          const { isPro, userId } = await getAIPlanState();
          
          // Use custom prompt if provided in config, otherwise fall back to default
          const systemPrompt = config?.customPrompts?.textAnalyzer 
            ?? (TEXT_ANALYZER_SYSTEM_MESSAGE.content as string);

          const { object } = await runTrackedAIRequest({
          route: 'actions.resumes.processTextImport',
          userId,
          isPro,
          config: withTaskModel({ task: "structuredExtraction", isPro, config }),
          }, (aiClient, telemetry) => generateObject({
          model: aiClient,
          maxRetries: 0,
          experimental_telemetry: telemetry,
          schema: z.object({
              content: textImportSchema
          }),
          prompt: text,
          system: systemPrompt,
          }));
      
          return object.content;
      }
      
      // WORK EXPERIENCE MODIFICATION
      export async function modifyWorkExperience(
          experience: WorkExperience[],
          prompt: string,
          config?: AIConfig
      ) {
          const { isPro, userId } = await getAIPlanState();
          
          const { object } = await runTrackedAIRequest({
          route: 'actions.resumes.modifyWorkExperience',
          userId,
          isPro,
          config: withTaskModel({ task: "simpleRewrite", isPro, config }),
          }, (aiClient, telemetry) => generateObject({
          model: aiClient,
          maxRetries: 0,
          experimental_telemetry: telemetry,
          schema: z.object({
              content: workExperienceItemsSchema
          }),
          prompt: `Please modify this work experience entry according to these instructions: ${prompt}\n\nCurrent work experience:\n${JSON.stringify(experience, null, 2)}`,
          system: `You are a professional resume writer. Modify the given work experience based on the user's instructions. 
          Maintain professionalism and accuracy while implementing the requested changes. 
          Keep the same company and dates, but modify other fields as requested.
          Use strong action verbs and quantifiable achievements where possible.`,
          }));
      
          return object.content;
      }
      
      // ADDING TEXT CONTENT TO RESUME
      export async function addTextToResume(prompt: string, existingResume: Resume, config?: AIConfig) {
          const { isPro, userId } = await getAIPlanState();
  
          // Use custom prompt if provided in config, otherwise fall back to default
          const systemPrompt = config?.customPrompts?.textAnalyzer 
            ?? (TEXT_ANALYZER_SYSTEM_MESSAGE.content as string);
          
          const { object } = await runTrackedAIRequest({
          route: 'actions.resumes.addTextToResume',
          userId,
          isPro,
          config: withTaskModel({ task: "structuredExtraction", isPro, config }),
          }, (aiClient, telemetry) => generateObject({
          model: aiClient,
          maxRetries: 0,
          experimental_telemetry: telemetry,
          schema: z.object({
              content: textImportSchema
          }),
          prompt: `Extract relevant resume information from the following text, including basic information (name, contact details, etc) and professional experience. Format them according to the schema:\n\n${prompt}`,
          system: systemPrompt,
          }));
          
          // Merge the AI-generated content with existing resume data
          const updatedResume = {
          ...existingResume,
          ...(object.content.first_name && { first_name: object.content.first_name }),
          ...(object.content.last_name && { last_name: object.content.last_name }),
          ...(object.content.email && { email: object.content.email }),
          ...(object.content.phone_number && { phone_number: object.content.phone_number }),
          ...(object.content.location && { location: object.content.location }),
          ...(object.content.website && { website: object.content.website }),
          ...(object.content.linkedin_url && { linkedin_url: object.content.linkedin_url }),
          ...(object.content.github_url && { github_url: object.content.github_url }),
          
          work_experience: [...existingResume.work_experience, ...(object.content.work_experience || [])],
          education: [...existingResume.education, ...(object.content.education || [])],
          skills: [...existingResume.skills, ...(object.content.skills || [])],
          projects: [...existingResume.projects, ...(object.content.projects || [])],
          };
          
          return updatedResume;
      }
