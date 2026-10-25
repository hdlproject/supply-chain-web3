import { LinkIcon } from "./icons";

// Card title with an optional on-chain instruction chip, e.g.
// grant_role(wallet, role), so every action card shows which program call
// it maps to.
export function CardHeader({
  title,
  call,
  description,
}: {
  title: string;
  call?: string;
  description?: string;
}) {
  return (
    <>
      <div className="card-header">
        <h2 className="section-title">{title}</h2>
        {call ? (
          <span className="call" title="On-chain instruction">
            <LinkIcon small />
            {call}
          </span>
        ) : null}
      </div>
      {description ? <p className="section-sub">{description}</p> : null}
    </>
  );
}
