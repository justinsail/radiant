/**
 * One definition of "will this model run", shared by the Mac app and the phone.
 *
 * Tony: "shouldnt the text around the model size and feasibility match the
 * gradiant mac app? ... we should standardize the naming conventions." They had
 * drifted: the Mac said "runs well / tight fit / too big" in grey-amber-grey,
 * the phone said "Runs well / Runs tight / Won't run" in green-amber-red. Same
 * judgement, two vocabularies, and the one place a user sees both is when they
 * own both apps.
 *
 * ⚠️ THE WORDS AND THE THRESHOLDS LIVE HERE AND NOWHERE ELSE. Neither app may
 * define its own copy — that is how they drifted the first time. What each app
 * still owns is the BUDGET it measures against, because those genuinely differ:
 * the Mac compares against its unified memory, the phone against the much
 * smaller slice iOS grants a single app.
 */

export const FITS_WELL = 'well'
export const FITS_TIGHT = 'tight'
export const FITS_NO = 'no'

/** Fractions of the available memory. 75% is comfortable, 95% is the edge. */
export const COMFORTABLE = 0.75
export const EDGE = 0.95

/** The phone's wording, adopted by both — it is the plainest of the two. */
export const FIT_LABEL = {
  [FITS_WELL]: 'Runs well',
  [FITS_TIGHT]: 'Runs tight',
  [FITS_NO]: "Won't run"
}

/** Traffic lights, both apps. Tony's call. */
export const FIT_TONE = {
  [FITS_WELL]: 'green',
  [FITS_TIGHT]: 'amber',
  [FITS_NO]: 'red'
}

/**
 * The verdict, given what a model needs and what the machine can give it.
 * Both in the same unit; the caller decides whether that is GB or bytes.
 */
export function verdict (need, budget) {
  if (!budget || !need) return null
  if (need <= budget * COMFORTABLE) return FITS_WELL
  if (need <= budget * EDGE) return FITS_TIGHT
  return FITS_NO
}
