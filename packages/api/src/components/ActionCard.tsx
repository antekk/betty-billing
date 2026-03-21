"use client";

interface ActionCardAction {
  label: string;
  payload: string;
  style?: "primary" | "secondary";
}

interface ActionCardData {
  title: string;
  body: string;
  claimId?: string;
  actions: ActionCardAction[];
}

interface ActionCardProps {
  data: ActionCardData;
  onAction: (payload: string) => void;
}

export function ActionCard({ data, onAction }: ActionCardProps) {
  return (
    <div className="mx-4 my-1 overflow-hidden rounded-xl border border-border bg-white shadow-sm">
      <div className="border-l-4 border-l-error px-4 py-3">
        <div className="mb-1 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-error" />
          <h3 className="text-sm font-semibold text-text-primary">{data.title}</h3>
        </div>
        <p className="text-sm text-text-secondary">{data.body}</p>
      </div>

      {data.actions.length > 0 && (
        <div className="flex gap-2 border-t border-separator px-4 py-3">
          {data.actions.map((action) => (
            <button
              key={action.payload}
              onClick={() => onAction(action.payload)}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-opacity active:opacity-80 ${
                action.style === "primary"
                  ? "bg-primary text-white"
                  : "bg-input-bg text-text-primary"
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
