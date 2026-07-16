export type ProfilePrompt = {
  question?: string;
  answer?: string;
  [key: string]: unknown;
};

function isPrompt(value: unknown): value is ProfilePrompt {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isSchoolQuestion(value: unknown) {
  return typeof value === "string" && value.trim().toLowerCase().includes("school");
}

export function getProfilePrompts(value: unknown) {
  return Array.isArray(value) ? value.filter(isPrompt) : [];
}

export function getSchoolPromptAnswer(value: unknown) {
  const prompt = getProfilePrompts(value).find((item) => isSchoolQuestion(item.question));
  return typeof prompt?.answer === "string" ? prompt.answer : "";
}

export function updateSchoolPrompt(value: unknown, school: string) {
  const prompts = getProfilePrompts(value);
  const answer = school.trim();
  const nextPrompts: ProfilePrompt[] = [];
  let schoolAdded = false;

  prompts.forEach((prompt) => {
    if (!isSchoolQuestion(prompt.question)) {
      nextPrompts.push(prompt);
      return;
    }
    if (answer && !schoolAdded) {
      nextPrompts.push({ ...prompt, question: "School", answer });
      schoolAdded = true;
    }
  });

  if (answer && !schoolAdded) nextPrompts.push({ question: "School", answer });
  return nextPrompts;
}
