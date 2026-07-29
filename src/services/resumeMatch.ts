import { RESUME_SKILLS, SKILL_VOCABULARY } from '../config/skills';
import type { LeadMatch, NormalizedLead } from '../types';

const RESUME_SKILL_SET = new Set(RESUME_SKILLS.map((skill) => skill.toLowerCase()));

function extractMentionedSkills(text: string): readonly string[] {
  const lower = text.toLowerCase();
  return SKILL_VOCABULARY.filter((skill) => lower.includes(skill));
}

/**
 * Scores 0-10 based on what fraction of a lead's mentioned tech skills are
 * ones on the resume — a job wanting 3 things you have scores higher than
 * one wanting 10 things where you only match 3. A lead that mentions no
 * recognizable skill at all scores 0 (nothing to evaluate fit against).
 *
 * This is a deterministic keyword-overlap heuristic, not semantic
 * understanding — it won't catch experience-level mismatches ("5 years
 * required" vs. 2 actual) or synonyms outside the vocabulary list.
 */
export function scoreLead(lead: NormalizedLead): LeadMatch {
  const combinedText = `${lead.title}\n${lead.body}`;
  const mentionedSkills = extractMentionedSkills(combinedText);

  if (mentionedSkills.length === 0) {
    return { score: 0, matchedSkills: [], mentionedSkills: [] };
  }

  const matchedSkills = mentionedSkills.filter((skill) => RESUME_SKILL_SET.has(skill));
  const score = Math.round((matchedSkills.length / mentionedSkills.length) * 10);

  return { score, matchedSkills, mentionedSkills };
}
