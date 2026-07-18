export type DemoMode = "solo" | "duo" | "group";

export const MAX_DEMO_CSV_FILE_SIZE = 2 * 1024 * 1024;
export const MAX_DEMO_IMPORT_ENTITIES = 100;
export const MAX_DEMO_IMPORT_MEMBERS = 250;

export const DEMO_DATA_HEADERS = [
  "mode",
  "entity_key",
  "member_order",
  "email",
  "password",
  "full_name",
  "birth_month",
  "birth_day",
  "birth_year",
  "hide_birthday",
  "gender",
  "interested_in",
  "height",
  "intent",
  "looking_for",
  "preferred_age_min",
  "preferred_age_max",
  "work_status",
  "occupation",
  "education",
  "school",
  "city",
  "latitude",
  "longitude",
  "hometown",
  "ethnicity",
  "preferred_ethnicities",
  "religion",
  "workout",
  "smoking",
  "drinking",
  "diet",
  "pets",
  "sleep",
  "lifestyle",
  "vibe",
  "bio",
  "interests",
  "photo_urls",
  "photo_captions",
  "address_line",
  "state_region",
  "postal_code",
  "country",
  "search_radius_miles",
  "shared_name",
  "shared_bio",
  "shared_city",
  "shared_activities",
  "shared_lifestyle",
  "shared_vibe",
  "shared_intent",
  "shared_looking_for",
  "icebreaker_1",
  "icebreaker_2",
  "icebreaker_3",
  "is_verified",
] as const;

export const DEMO_CHOICE_HEADERS = [
  "chip_boolean_options",
  "chip_gender_options",
  "chip_interested_in_options",
  "chip_height_options",
  "chip_intent_options",
  "chip_looking_for_options",
  "chip_work_status_options",
  "chip_occupation_options",
  "chip_education_options",
  "chip_ethnicity_options",
  "chip_religion_options",
  "chip_workout_options",
  "chip_smoking_options",
  "chip_drinking_options",
  "chip_diet_options",
  "chip_pets_options",
  "chip_sleep_options",
  "chip_lifestyle_options",
  "chip_vibe_options",
  "chip_interest_options",
] as const;

export const DEMO_CSV_HEADERS = [...DEMO_DATA_HEADERS, ...DEMO_CHOICE_HEADERS] as const;

export type DemoCsvHeader = (typeof DEMO_CSV_HEADERS)[number];
export type DemoCsvRow = Record<DemoCsvHeader, string> & { source_row: number };

export type DemoMemberInput = {
  sourceRow: number;
  order: number;
  email: string;
  password: string;
  fullName: string;
  birthMonth: number;
  birthDay: number;
  birthYear: number;
  age: number;
  hideBirthday: boolean;
  gender: string;
  interestedIn: string;
  height: string;
  intent: string;
  lookingFor: string;
  preferredAgeMin: number;
  preferredAgeMax: number;
  workStatus: string;
  occupation: string;
  education: string;
  school: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  hometown: string;
  ethnicity: string;
  preferredEthnicities: string[];
  religion: string;
  workout: string;
  smoking: string;
  drinking: string;
  diet: string;
  pets: string;
  sleep: string;
  lifestyle: string;
  vibe: string;
  bio: string;
  interests: string[];
  photos: string[];
  photoCaptions: string[];
  addressLine: string;
  stateRegion: string;
  postalCode: string;
  country: string;
  searchRadiusMiles: number;
  isVerified: boolean;
};

export type DemoSharedInput = {
  name: string;
  bio: string;
  city: string;
  activities: string[];
  lifestyle: string;
  vibe: string;
  intent: string;
  lookingFor: string;
  icebreakers: string[];
};

export type DemoEntityInput = {
  key: string;
  mode: DemoMode;
  members: DemoMemberInput[];
  shared: DemoSharedInput;
};

export type DemoImportValidation = {
  entities: DemoEntityInput[];
  errors: string[];
  warnings: string[];
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function splitList(value: unknown) {
  return clean(value)
    .split(/[;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBoolean(value: unknown, fallback = false) {
  const normalized = clean(value).toLowerCase();
  if (["true", "yes", "1", "y"].includes(normalized)) return true;
  if (["false", "no", "0", "n"].includes(normalized)) return false;
  return fallback;
}

function parseNumber(value: unknown, fallback: number) {
  const parsed = Number(clean(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function calculateAge(month: number, day: number, year: number) {
  const birthday = new Date(year, month - 1, day);
  if (
    birthday.getFullYear() !== year ||
    birthday.getMonth() !== month - 1 ||
    birthday.getDate() !== day
  ) {
    return null;
  }

  const today = new Date();
  let age = today.getFullYear() - year;
  const hadBirthday =
    today.getMonth() > birthday.getMonth() ||
    (today.getMonth() === birthday.getMonth() && today.getDate() >= birthday.getDate());
  if (!hadBirthday) age -= 1;
  return age;
}

function isHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isTemplatePhotoUrl(value: string) {
  try {
    return new URL(value).hostname.toLowerCase() === "your-cdn.example";
  } catch {
    return false;
  }
}

function isUsablePhotoUrl(value: string) {
  return isHttpUrl(value) && !isTemplatePhotoUrl(value);
}

function normalizeMode(value: unknown): DemoMode | null {
  const mode = clean(value).toLowerCase();
  return mode === "solo" || mode === "duo" || mode === "group" ? mode : null;
}

function sampleBase(overrides: Partial<Record<DemoCsvHeader, string>>) {
  return Object.fromEntries(
    DEMO_CSV_HEADERS.map((header) => [header, overrides[header] ?? ""])
  ) as Record<DemoCsvHeader, string>;
}

const GENDER_OPTIONS = ["Man", "Woman", "Non-binary"];
const INTERESTED_IN_OPTIONS = ["Man", "Woman", "Both"];
const HEIGHT_OPTIONS = [
  "4'10", "4'11", "5'0", "5'1", "5'2", "5'3", "5'4", "5'5", "5'6", "5'7",
  "5'8", "5'9", "5'10", "5'11", "6'0", "6'1", "6'2", "6'3", "6'4+",
];
const WORK_OPTIONS = ["Working", "Studying", "Something else"];
const OCCUPATION_OPTIONS = [
  "Student", "Business Owner", "Tech", "Healthcare", "Creative", "Service", "Self-employed", "Other",
];
const SOLO_EDUCATION_OPTIONS = [
  "High School", "Trade/Tech School", "Associate Degree", "Bachelor's", "Grad Student", "Postgrad", "Other",
];
const SOCIAL_EDUCATION_OPTIONS = [
  "High School", "College", "Bachelor Degree", "Master Degree", "Trade School", "Other",
];
const SOLO_INTENT_OPTIONS = [
  "Long-term", "Long-term, open to short", "Short-term, open to long", "Short-term",
  "Chats and new friends", "Not sure yet",
];
const DUO_INTENT_OPTIONS = ["Friends First", "Serious", "Casual", "Relationship", "Open to See"];
const GROUP_INTENT_OPTIONS = ["Friends First", "Serious", "Casual", "Relationship", "Open to See"];
const SOLO_LOOKING_FOR_OPTIONS = [
  "Relationship", "Dates", "Friendship", "Duo Match", "Group Hangouts", "Good Conversations",
];
const DUO_LOOKING_FOR_OPTIONS = ["Duo Match", "Friendship", "Double Dates", "New People", "Relationship"];
const GROUP_LOOKING_FOR_OPTIONS = ["Groups", "Friendship", "Group Dates", "New People", "Relationship"];
const ETHNICITY_OPTIONS = [
  "Black/African American", "East Asian", "Hispanic/Latino", "Middle Eastern", "Native American",
  "Pacific Islander", "South Asian", "South East Asian", "White/Caucasian", "Other Ethnicity",
  "Prefer not to say",
];
const RELIGION_OPTIONS = [
  "Agnostic", "Atheist", "Buddhist", "Catholic", "Christian", "Hindu", "Jain", "Jewish",
  "Muslim", "Sikh", "Spiritual", "Prefer not to say",
];
const WORKOUT_OPTIONS = ["Active", "Sometimes", "Not really"];
const SMOKING_OPTIONS = ["Non-smoker", "Socially", "Smoke when drinking", "Often", "Sometimes"];
const DRINKING_OPTIONS = ["Socially", "Never", "Often", "Sometimes"];
const DIET_OPTIONS = [
  "Nothing specific", "Vegan", "Vegetarian", "Kosher", "Halal", "Pescatarian", "Carnivore",
  "Other dietary preferences",
];
const PET_OPTIONS = ["No pets", "Cat owner", "Dog owner", "Fish", "Reptiles", "Other pets"];
const SLEEP_OPTIONS = ["Early bird", "Night owl", "It depends", "On a spectrum"];
const LIFESTYLE_OPTIONS = ["Calm", "Active", "Social", "Homebody", "Spontaneous", "Balanced"];
const VIBE_OPTIONS = ["Fun", "Adventurous", "Romantic", "Chill", "Foodie", "Night Out", "Travel"];
const INTEREST_OPTIONS = [
  "Custom: enter your own tag", "Let's geek out on Marvel", "Obsessed with Stephen King",
  "Shares interesting podcast facts", "Scrolls Pinterest for room decor", "Coffee Dates", "Brunch",
  "Late Night Drives", "Foodie Spots", "Movie Night", "Proud of the life I built", "Keeps a small circle",
  "My friends are my community", "Balancing me-time and we-time", "Co-op games", "Casual gamer",
  "Competitive nights", "Retro games", "Museums", "Painting", "Photography", "Live music", "Design lover",
  "Exploring small towns for hidden gems", "Believes in handwritten cards", "Makes people laugh with dad jokes",
  "Down for clean conversations", "Dog person", "Cat person", "Animal lover", "No pets but open",
  "Balancing me-time & we-time", "Not a big social media person", "Puts effort into my appearance",
  "Keeps things well-organized", "Good hygiene is a must", "Movie marathons", "Reality shows", "Crime docs",
  "Comedy nights",
];

function optionList(values: string[]) {
  return values.join("; ");
}

function getChoiceReference(mode: DemoMode): Partial<Record<DemoCsvHeader, string>> {
  const intentOptions =
    mode === "solo" ? SOLO_INTENT_OPTIONS : mode === "duo" ? DUO_INTENT_OPTIONS : GROUP_INTENT_OPTIONS;
  const lookingForOptions =
    mode === "solo"
      ? SOLO_LOOKING_FOR_OPTIONS
      : mode === "duo"
        ? DUO_LOOKING_FOR_OPTIONS
        : GROUP_LOOKING_FOR_OPTIONS;

  return {
    chip_boolean_options: "true; false",
    chip_gender_options: optionList(GENDER_OPTIONS),
    chip_interested_in_options: optionList(INTERESTED_IN_OPTIONS),
    chip_height_options: optionList(HEIGHT_OPTIONS),
    chip_intent_options: optionList(intentOptions),
    chip_looking_for_options: optionList(lookingForOptions),
    chip_work_status_options: optionList(WORK_OPTIONS),
    chip_occupation_options: optionList(OCCUPATION_OPTIONS),
    chip_education_options: optionList(mode === "solo" ? SOLO_EDUCATION_OPTIONS : SOCIAL_EDUCATION_OPTIONS),
    chip_ethnicity_options: optionList(ETHNICITY_OPTIONS),
    chip_religion_options: optionList(RELIGION_OPTIONS),
    chip_workout_options: optionList(WORKOUT_OPTIONS),
    chip_smoking_options: optionList(SMOKING_OPTIONS),
    chip_drinking_options: optionList(DRINKING_OPTIONS),
    chip_diet_options: optionList(DIET_OPTIONS),
    chip_pets_options: optionList(PET_OPTIONS),
    chip_sleep_options: optionList(SLEEP_OPTIONS),
    chip_lifestyle_options: optionList(LIFESTYLE_OPTIONS),
    chip_vibe_options: optionList(VIBE_OPTIONS),
    chip_interest_options: optionList(INTEREST_OPTIONS),
  };
}

const sharedMemberDefaults: Partial<Record<DemoCsvHeader, string>> = {
  birth_month: "6",
  birth_day: "15",
  birth_year: "1998",
  hide_birthday: "true",
  gender: "Woman",
  interested_in: "Man",
  height: "5'6",
  intent: "Long-term",
  looking_for: "Good Conversations",
  preferred_age_min: "24",
  preferred_age_max: "38",
  work_status: "Working",
  occupation: "Creative",
  education: "Bachelor's",
  school: "Demo University",
  city: "Los Angeles",
  latitude: "34.0522342",
  longitude: "-118.2436849",
  hometown: "San Diego",
  ethnicity: "Prefer not to say",
  preferred_ethnicities: "Prefer not to say",
  religion: "Prefer not to say",
  workout: "Sometimes",
  smoking: "Non-smoker",
  drinking: "Socially",
  diet: "Nothing specific",
  pets: "Dog owner",
  sleep: "Night owl",
  lifestyle: "Social",
  vibe: "Fun",
  bio: "Demo profile for testing Yarri discovery and matching.",
  interests: "Coffee Dates;Live music;Photography;Movie marathons;Dog person",
  photo_urls: "",
  photo_captions: "",
  country: "United States",
  search_radius_miles: "50",
  is_verified: "false",
};

export function getDemoTemplateRows(mode: DemoMode) {
  if (mode === "solo") {
    return [
      sampleBase({
        ...sharedMemberDefaults,
        ...getChoiceReference("solo"),
        mode: "solo",
        entity_key: "solo_demo_001",
        member_order: "1",
        email: "solo.demo.001@example.com",
        password: "DemoPass123!",
        full_name: "Solo Demo",
      }),
    ];
  }

  const shared = {
    shared_name: mode === "duo" ? "Sunset Duo" : "Friday Friends",
    shared_bio:
      mode === "duo"
        ? "Two friends looking for good people and relaxed double dates."
        : "A social group that likes food, music, and trying something new.",
    shared_city: "Los Angeles",
    shared_activities: "Brunch;Live music;Beach days;Game nights;Travel",
    shared_lifestyle: "Social",
    shared_vibe: "Fun",
    shared_intent: mode === "duo" ? "Friends First" : "Open to See",
    shared_looking_for: mode === "duo" ? "Double Dates" : "Group Dates",
    icebreaker_1: "Pick the place and we will bring the energy.",
    icebreaker_2: "Friendly, curious, and always ready for food.",
    icebreaker_3: "Dinner, music, and one plan nobody has tried before.",
  } satisfies Partial<Record<DemoCsvHeader, string>>;

  const count = mode === "duo" ? 2 : 3;
  return Array.from({ length: count }, (_, index) =>
    sampleBase({
      ...sharedMemberDefaults,
      ...getChoiceReference(mode),
      ...shared,
      mode,
      entity_key: `${mode}_demo_001`,
      member_order: String(index + 1),
      email: `${mode}.demo.00${index + 1}@example.com`,
      password: "DemoPass123!",
      full_name: `${mode === "duo" ? "Duo" : "Group"} Member ${index + 1}`,
      intent: mode === "duo" ? "Relationship" : "Serious",
      looking_for: mode === "duo" ? "Double Dates" : "Group Dates",
      education: "Bachelor Degree",
      gender: index % 2 === 0 ? "Woman" : "Man",
      interested_in: index % 2 === 0 ? "Man" : "Woman",
      photo_urls: "",
    })
  );
}

export function normalizeDemoCsvRows(rows: Record<string, unknown>[]): DemoCsvRow[] {
  return rows.map((row, index) => {
    const normalized = Object.fromEntries(
      DEMO_CSV_HEADERS.map((header) => [header, clean(row[header])])
    ) as Record<DemoCsvHeader, string>;
    return { ...normalized, source_row: index + 2 };
  });
}

export function validateAndGroupDemoRows(rows: DemoCsvRow[]): DemoImportValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const groups = new Map<string, DemoCsvRow[]>();
  const seenEmails = new Map<string, number>();

  rows.forEach((row) => {
    const key = clean(row.entity_key);
    if (!key) {
      errors.push(`Row ${row.source_row}: entity_key is required.`);
      return;
    }
    groups.set(key, [...(groups.get(key) || []), row]);

    const email = clean(row.email).toLowerCase();
    if (email) {
      const previousRow = seenEmails.get(email);
      if (previousRow) {
        errors.push(`Row ${row.source_row}: email duplicates row ${previousRow}.`);
      } else {
        seenEmails.set(email, row.source_row);
      }
    }
  });

  const entities: DemoEntityInput[] = [];

  groups.forEach((entityRows, key) => {
    const modes = Array.from(new Set(entityRows.map((row) => normalizeMode(row.mode))));
    if (modes.length !== 1 || !modes[0]) {
      errors.push(`Entity ${key}: every row must use the same valid mode.`);
      return;
    }

    const mode = modes[0];
    const expectedDescription = mode === "solo" ? "exactly 1" : mode === "duo" ? "exactly 2" : "2 to 5";
    const countIsValid =
      (mode === "solo" && entityRows.length === 1) ||
      (mode === "duo" && entityRows.length === 2) ||
      (mode === "group" && entityRows.length >= 2 && entityRows.length <= 5);

    if (!countIsValid) {
      errors.push(`Entity ${key}: ${mode} requires ${expectedDescription} member row(s).`);
      return;
    }

    const first = entityRows[0];
    const shared: DemoSharedInput = {
      name: clean(first.shared_name),
      bio: clean(first.shared_bio),
      city: clean(first.shared_city),
      activities: splitList(first.shared_activities),
      lifestyle: clean(first.shared_lifestyle),
      vibe: clean(first.shared_vibe),
      intent: clean(first.shared_intent),
      lookingFor: clean(first.shared_looking_for),
      icebreakers: [first.icebreaker_1, first.icebreaker_2, first.icebreaker_3]
        .map(clean)
        .filter(Boolean),
    };

    if (mode !== "solo") {
      const missingShared = [
        ["shared_name", shared.name],
        ["shared_bio", shared.bio],
        ["shared_city", shared.city],
        ["shared_activities", shared.activities.length ? "ok" : ""],
        ["shared_lifestyle", shared.lifestyle],
        ["shared_vibe", shared.vibe],
        ["shared_intent", shared.intent],
        ["shared_looking_for", shared.lookingFor],
      ].filter(([, value]) => !value);
      if (missingShared.length) {
        errors.push(`Entity ${key}: missing ${missingShared.map(([name]) => name).join(", ")}.`);
      }
    }

    const members: DemoMemberInput[] = [];
    const seenOrders = new Set<number>();

    entityRows.forEach((row) => {
      const rowPrefix = `Row ${row.source_row}`;
      const order = Math.floor(parseNumber(row.member_order, 0));
      if (order < 1 || seenOrders.has(order)) {
        errors.push(`${rowPrefix}: member_order must be a unique positive number inside ${key}.`);
      }
      seenOrders.add(order);

      const email = clean(row.email).toLowerCase();
      const password = clean(row.password);
      const fullName = clean(row.full_name);
      const birthMonth = Math.floor(parseNumber(row.birth_month, 0));
      const birthDay = Math.floor(parseNumber(row.birth_day, 0));
      const birthYear = Math.floor(parseNumber(row.birth_year, 0));
      const age = calculateAge(birthMonth, birthDay, birthYear);
      const gender = clean(row.gender);
      const interestedIn = clean(row.interested_in);
      const intent = clean(row.intent);
      const lookingFor = clean(row.looking_for);
      const city = clean(row.city) || shared.city;
      const latitudeText = clean(row.latitude);
      const longitudeText = clean(row.longitude);
      const hasLatitude = Boolean(latitudeText);
      const hasLongitude = Boolean(longitudeText);
      const latitude = hasLatitude ? Number(latitudeText) : null;
      const longitude = hasLongitude ? Number(longitudeText) : null;
      const bio = clean(row.bio) || shared.bio;
      const interests = splitList(row.interests);
      const suppliedPhotos = splitList(row.photo_urls);
      const suppliedPhotoCaptions = splitList(row.photo_captions);
      const usablePhotoEntries = suppliedPhotos
        .map((photo, index) => ({ photo, caption: suppliedPhotoCaptions[index] || "" }))
        .filter((entry) => isUsablePhotoUrl(entry.photo));
      const importedPhotoEntries = usablePhotoEntries.slice(0, 5);
      const photos = importedPhotoEntries.map((entry) => entry.photo);
      const photoCaptions = importedPhotoEntries.map((entry) => entry.caption);
      const preferredAgeMin = Math.floor(parseNumber(row.preferred_age_min, 18));
      const preferredAgeMax = Math.floor(parseNumber(row.preferred_age_max, 50));

      if (!email || !/^\S+@\S+\.\S+$/.test(email)) errors.push(`${rowPrefix}: valid email is required.`);
      if (password.length < 6) errors.push(`${rowPrefix}: password must be at least 6 characters.`);
      if (!fullName) errors.push(`${rowPrefix}: full_name is required.`);
      if (age === null || age < 18 || age > 99) errors.push(`${rowPrefix}: enter a valid adult birthday.`);
      if (!gender) errors.push(`${rowPrefix}: gender is required.`);
      if (!interestedIn) errors.push(`${rowPrefix}: interested_in is required.`);
      if (!intent) errors.push(`${rowPrefix}: intent is required.`);
      if (!lookingFor) errors.push(`${rowPrefix}: looking_for is required.`);
      if (!city) errors.push(`${rowPrefix}: city or shared_city is required.`);
      if (hasLatitude !== hasLongitude) {
        errors.push(`${rowPrefix}: latitude and longitude must either both be filled or both be blank.`);
      } else if (
        hasLatitude &&
        (!Number.isFinite(latitude) ||
          !Number.isFinite(longitude) ||
          Number(latitude) < -90 ||
          Number(latitude) > 90 ||
          Number(longitude) < -180 ||
          Number(longitude) > 180)
      ) {
        errors.push(`${rowPrefix}: enter valid latitude (-90 to 90) and longitude (-180 to 180).`);
      }
      if (!bio) errors.push(`${rowPrefix}: bio or shared_bio is required.`);
      if (interests.length < 5 || interests.length > 8) {
        errors.push(`${rowPrefix}: add 5 to 8 semicolon-separated interests.`);
      }
      if (usablePhotoEntries.length !== suppliedPhotos.length) {
        warnings.push(`${rowPrefix}: invalid photo URL values were ignored.`);
      }
      if (usablePhotoEntries.length > 5) {
        warnings.push(`${rowPrefix}: only the first 5 valid profile photos will be imported.`);
      }
      if (suppliedPhotoCaptions.length > photos.length) {
        warnings.push(`${rowPrefix}: photo captions without a valid photo were ignored.`);
      }
      if (preferredAgeMin < 18 || preferredAgeMax > 99 || preferredAgeMin >= preferredAgeMax) {
        errors.push(`${rowPrefix}: preferred age range must be between 18 and 99.`);
      }

      const verified = parseBoolean(row.is_verified, false);
      if (!verified) warnings.push(`${rowPrefix}: chat remains locked until this profile is verified.`);

      members.push({
        sourceRow: row.source_row,
        order,
        email,
        password,
        fullName,
        birthMonth,
        birthDay,
        birthYear,
        age: age ?? 0,
        hideBirthday: parseBoolean(row.hide_birthday, false),
        gender,
        interestedIn,
        height: clean(row.height),
        intent,
        lookingFor,
        preferredAgeMin,
        preferredAgeMax,
        workStatus: clean(row.work_status),
        occupation: clean(row.occupation),
        education: clean(row.education),
        school: clean(row.school),
        city,
        latitude,
        longitude,
        hometown: clean(row.hometown),
        ethnicity: clean(row.ethnicity),
        preferredEthnicities: splitList(row.preferred_ethnicities),
        religion: clean(row.religion),
        workout: clean(row.workout),
        smoking: clean(row.smoking),
        drinking: clean(row.drinking),
        diet: clean(row.diet),
        pets: clean(row.pets),
        sleep: clean(row.sleep),
        lifestyle: clean(row.lifestyle) || shared.lifestyle,
        vibe: clean(row.vibe) || shared.vibe,
        bio,
        interests,
        photos,
        photoCaptions,
        addressLine: clean(row.address_line),
        stateRegion: clean(row.state_region),
        postalCode: clean(row.postal_code),
        country: clean(row.country) || "United States",
        searchRadiusMiles: Math.min(500, Math.max(1, Math.floor(parseNumber(row.search_radius_miles, 50)))),
        isVerified: verified,
      });
    });

    entities.push({
      key,
      mode,
      members: members.sort((a, b) => a.order - b.order),
      shared,
    });
  });

  return {
    entities: errors.length ? [] : entities,
    errors,
    warnings: Array.from(new Set(warnings)),
  };
}
