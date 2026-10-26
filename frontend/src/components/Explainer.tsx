export function Explainer() {
  return (
    <details className="rounded-xl border border-line bg-surface p-5" open>
      <summary className="cursor-pointer text-base font-semibold text-ink">
        How to read this
      </summary>
      <div className="mt-3 grid gap-4 text-sm text-ink-2 md:grid-cols-2">
        <div>
          <h3 className="font-medium text-ink">What is compared</h3>
          <p className="mt-1">
            For every hour of delivery we take the national wind forecast (Elexon WINDFOR) that you
            could actually have seen <em>before</em> the day-ahead auction closed on the previous
            day, and compare it with the wind that was actually generated (Elexon FUELHH). No
            forecast published after the cutoff is ever used.
          </p>
        </div>
        <div>
          <h3 className="font-medium text-ink">What the numbers mean</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>
              <strong className="text-ink">Error</strong> = forecast − actual. Positive means wind
              came in <em>below</em> forecast (a <strong className="text-ink">shortfall</strong>):
              you are short and must buy more.
            </li>
            <li>
              <strong className="text-ink">Mean absolute error</strong> is the typical size of a
              miss; <strong className="text-ink">bias</strong> shows whether forecasts lean high or
              low.
            </li>
            <li>
              <strong className="text-ink">P90 shortfall</strong>: in 9 out of 10 shortfall hours,
              the gap was smaller than this.
            </li>
          </ul>
        </div>
        <div>
          <h3 className="font-medium text-ink">Using the buffer</h3>
          <p className="mt-1">
            The suggested buffer is how much less wind than forecast to plan for so that actual wind
            would have been enough in the chosen share of hours (90% by default). Raise the share
            for more protection at the cost of buying more.
          </p>
        </div>
        <div>
          <h3 className="font-medium text-ink">Controls</h3>
          <p className="mt-1">
            Change the cutoff to match the auction you trade in, or move the lead-time slider to see
            how accuracy improves as the forecast gets closer to delivery. Drag the handles under
            the main chart to zoom. All times are UK time (Europe/London).
          </p>
        </div>
      </div>
    </details>
  );
}
