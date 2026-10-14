/**
 * PostgREST returns at most 1000 rows per select by default and reports no
 * error when it truncates — the caller just silently gets a prefix. Any query
 * whose result set can exceed that has to page explicitly.
 *
 * At full enrolment this study holds ~36 sessions x ~46 questions of answer
 * rows, which is comfortably past the cap, so the CSV export and the study
 * frame both depend on this.
 */
const PAGE_SIZE = 1000;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

/**
 * Run `page` repeatedly over inclusive [from, to] row ranges until it returns a
 * short page. `page` should apply `.range(from, to)` to an otherwise-complete
 * query, and must impose a stable order — without one, PostgREST may repeat or
 * skip rows across pages.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  label: string,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Could not load ${label}`);
    const batch = data ?? [];
    all.push(...batch);
    if (batch.length < PAGE_SIZE) return all;
  }
}
