import { Icon } from "./Icon";
const steps = [
  {
    title: "Searching",
    description: "Querying Google Maps & Yelp for matching spots and reviews",
  },
  {
    title: "Compiling",
    description: "Synthesizing review sentiment, authenticity, and ratings",
  },
  {
    title: "Making a list",
    description: "Ranking dishes with AI and highlighting customer quotes",
  },
];
export function SearchProgress({ step }: { step: number }) {
  return (
    <section className="search-progress" aria-label="Search progress">
      <div className="progress-heading">
        <span className="eyebrow">
          <span className="progress-pulse" />
          PROGRESS
        </span>
        <span role="status" aria-live="polite">
          Step {step} of 3 · {steps[step - 1].title}
        </span>
      </div>
      <div className="progress-track" aria-hidden="true">
        <div style={{ width: `${[33, 66, 95][step - 1]}%` }} />
      </div>
      <ol>
        {steps.map((item, index) => (
          <li
            key={item.title}
            className={
              index + 1 === step
                ? "current"
                : index + 1 < step
                  ? "complete"
                  : ""
            }
            aria-current={index + 1 === step ? "step" : undefined}
          >
            <span className="progress-number">
              {index + 1 < step ? <Icon name="check" size={16} /> : index + 1}
            </span>
            <div>
              <h3>
                {index + 1}. {item.title}
              </h3>
              <p>{item.description}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="progress-note">
        Preparing your recommendations. Steps are an estimated guide while the
        search runs.
      </p>
    </section>
  );
}
