import { pipe } from 'fp-ts/function'

/*
  Abstraction for a mechanism to perform actions repetitively until successful.
  Questo modulo è diviso in 3 sezioni
  - modello
  - primitive
  - combinatori
*/

// -------------------------------------------------------------------------------------
// model
// -------------------------------------------------------------------------------------

export interface RetryStatus {
  /** Iteration number, where `0` is the first try: how may retries? */
  readonly iterNumber: number

  /** Latest attempt's delay. Will always be `undefined` on first run. */
  readonly previousDelay: number | undefined
}

export const startStatus: RetryStatus = {
  iterNumber: 0,
  previousDelay: undefined
}

/**
 * A `RetryPolicy` is a function that takes an `RetryStatus` and
 * possibly returns a delay in milliseconds. Iteration numbers start
 * at zero and increase by one on each retry. A *undefined* return value from
 * the function implies we have reached the retry limit.
 * 
 * in funzione di un RetryStatus ci dice dopo quanti secondi dobbiamo riprovare
 */
export type RetryPolicy = (status: RetryStatus) => number | undefined


// -------------------------------------------------------------------------------------
// primitives
// -------------------------------------------------------------------------------------

/**
 * Constant delay with unlimited retries: ignora il RetryStatus
 */
export const constantDelay = (delay: number): RetryPolicy => (_) => delay

/**
 * Retry immediately (return 0), but only up to `i` times.
 * 
 * passati gli i tentativi, basta ritorna undefined: non si riprova più
 * dipende quindi dal RetryStatus, dal suo iterNumber
 */
export const limitRetries = (i: number): RetryPolicy => (status) =>
  status.iterNumber >= i ? undefined : 0

/**
 * Grow delay exponentially each iteration.
 * Each delay will increase by a factor of two.
 *
 * ignora il previousDelay del RetryStatus, esponenziale rispetto all'iterNumber
 */
export const exponentialBackoff = (delay: number): RetryPolicy => (status) =>
  delay * Math.pow(2, status.iterNumber) // delay * 2ˆstatus.iterNumber

// -------------------------------------------------------------------------------------
// combinators: prendono RetryPolicy e restituiscono nuove RetryPolicy
// -------------------------------------------------------------------------------------

/**
 * Set a time-upperbound for any delays that may be directed by the
 * given policy.
 */
export const capDelay = (maxDelay: number) => (
  policy: RetryPolicy
): RetryPolicy => (status) => {
  // la policy suggerisce un certo delay
  const delay = policy(status)
  // se non è undefined prendiamo il minimo tra quest'ultimo e quello preimpostato per il cap
  return delay === undefined ? undefined : Math.min(maxDelay, delay)
}

/**
 * Merges two policies. **Quiz**: cosa vuol dire fare merge di due policy?
 * In questo caso si va a preferire la policy che suggerisce un delay maggiore, a meno
 * che una delle due non ritorni undefined
 */
export const concat = (second: RetryPolicy) => (
  first: RetryPolicy
): RetryPolicy => (status) => {
  const delay1 = first(status)
  const delay2 = second(status)
  if (delay1 !== undefined && delay2 !== undefined) {
    return Math.max(delay1, delay2)
  }
  return undefined
}

// -------------------------------------------------------------------------------------
// tests
// -------------------------------------------------------------------------------------

/**
 * Apply policy on status to see what the decision would be: previousDelay aggiornato grazie
 * alla policy, iterNumber banalmente incrementato
 */
export const applyPolicy = (policy: RetryPolicy) => (
  status: RetryStatus
): RetryStatus => ({
  iterNumber: status.iterNumber + 1,
  previousDelay: policy(status)
})

/**
 * Apply a policy keeping all intermediate results: tutti i vari status generati
 */
export const dryRun = (policy: RetryPolicy): ReadonlyArray<RetryStatus> => {
  // la funzione che applicherà una policy a un RetryStatus per ottenerne una versione aggiornata
  const apply = applyPolicy(policy)

  // usiamo RetryStatus come status di partenza
  let status: RetryStatus = apply(startStatus)

  // qui salviamo gli status incontrati
  const out: Array<RetryStatus> = [status]

  // finché la policy non esce undefined come previousDelay
  while (status.previousDelay !== undefined) {
    // applichiamo la policy sull'ultimo stato generato
    out.push((status = apply(out[out.length - 1])))
  }
  return out
}



/*
  constantDelay(300)
    |> concat(exponentialBackoff(200))
    |> concat(limitRetries(5))
    |> capDelay(2000)
*/
const myPolicy = pipe(
  constantDelay(300),
  concat(exponentialBackoff(200)),
  concat(limitRetries(5)),
  capDelay(2000)
)

console.log(dryRun(myPolicy))
/*
[
  { iterNumber: 1, previousDelay: 300 },      <= constantDelay
  { iterNumber: 2, previousDelay: 400 },      <= exponentialBackoff
  { iterNumber: 3, previousDelay: 800 },      <= exponentialBackoff
  { iterNumber: 4, previousDelay: 1600 },     <= exponentialBackoff
  { iterNumber: 5, previousDelay: 2000 },     <= capDelay
  { iterNumber: 6, previousDelay: undefined } <= limitRetries
]
*/