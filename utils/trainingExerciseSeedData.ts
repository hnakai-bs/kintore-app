import rawSeed from "./trainingExerciseSeedData.json";

/** Firestore `trainingExercises` への初回投入用 */
export const TRAINING_EXERCISE_SEED = rawSeed as {
  name: string;
  guideUrl: string;
  bodyPart?: string;
}[];
