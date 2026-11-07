import { useId, useRef, useState } from "react";
import { Select } from "@base-ui/react/select";
import { Menu } from "@base-ui/react/menu";
import { Check, ChevronDown, MoreHorizontal } from "lucide-react";
import { Button, Input, Modal, Notice } from "../../components/ui";
import type { GameScreenProps } from "../../platform/contracts";

export function Choice({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  options: { value: string; label: string; disabled?: boolean }[];
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="fff-field">
      <span id={id} className="eyebrow">
        {label}
      </span>
      <Select.Root
        value={value || null}
        onValueChange={(v) => {
          if (v) onChange(v);
        }}
        items={options}
        disabled={disabled}
      >
        <Select.Trigger className="text-input fff-select" aria-labelledby={id}>
          <Select.Value placeholder="Choose…" />
          <Select.Icon>
            <ChevronDown size={16} />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner
            sideOffset={6}
            alignItemWithTrigger={false}
            className="fff-select-positioner"
          >
            <Select.Popup className="fff-select-popup">
              <Select.List>
                {options.map((option) => (
                  <Select.Item
                    className="fff-select-item"
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                  >
                    <Select.ItemText>{option.label}</Select.ItemText>
                    <Select.ItemIndicator>
                      <Check size={16} />
                    </Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}

export function useGameAction(send: GameScreenProps["send"], revision: number) {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function act(type: string, payload: object = {}) {
    if (pending.current) return false;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const reply = await send(
        type,
        { revision, ...payload },
        type === "newGame" ? { timeoutMs: 120000 } : undefined,
      );
      if (!reply.ok) throw new Error(reply.error ?? "Please try again.");
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Please try again.");
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return { act, busy, error, clearError: () => setError("") };
}

export function MoreOptions({
  disabled,
  canEdit,
  onEdit,
  onEnd,
}: {
  disabled: boolean;
  canEdit: boolean;
  onEdit(): void;
  onEnd(): void;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger className="button quiet" disabled={disabled}>
        <MoreHorizontal size={18} /> More options
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={8}>
          <Menu.Popup className="theme-menu">
            <Menu.Item
              className="theme-item"
              disabled={!canEdit}
              onClick={onEdit}
            >
              Edit a player's score
            </Menu.Item>
            <Menu.Item
              className="theme-item"
              disabled={!canEdit}
              onClick={onEnd}
            >
              End game…
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function ScoreEditor({
  open,
  onClose,
  players,
  busy,
  error,
  onSave,
}: {
  open: boolean;
  onClose(): void;
  players: { id: string; name: string; score: number }[];
  busy: boolean;
  error: string;
  onSave(id: string, total: number): Promise<boolean>;
}) {
  const [selected, setSelected] = useState(""),
    [total, setTotal] = useState("");
  const current = players.find((p) => p.id === selected) ?? players[0];
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit player score"
      description="Set a new total. Your correction stays intact when question points change."
    >
      <form
        className="fff-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (
            current &&
            total !== "" &&
            (await onSave(current.id, Number(total)))
          ) {
            setTotal("");
            onClose();
          }
        }}
      >
        <Choice
          label="Player"
          value={current?.id ?? ""}
          onChange={(id) => {
            setSelected(id);
            setTotal("");
          }}
          options={players.map((p) => ({ value: p.id, label: p.name }))}
          disabled={busy}
        />
        <label>
          New total
          <Input
            type="number"
            inputMode="numeric"
            required
            min={-1000000}
            max={1000000}
            step={1}
            value={total}
            placeholder={String(current?.score ?? 0)}
            onValueChange={setTotal}
          />
        </label>
        <Button
          type="submit"
          variant="primary"
          disabled={busy || !current || total === ""}
        >
          Save score
        </Button>
        {error && <Notice>{error}</Notice>}
      </form>
    </Modal>
  );
}
