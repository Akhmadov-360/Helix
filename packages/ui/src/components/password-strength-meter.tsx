import { cn } from "../lib/cn";

// Красный→оранжевый→жёлтый→зелёный — обычные Tailwind-цвета, не заводим под это семантический
// токен: смысл этой градации не переиспользуется больше нигде в продукте (в отличие от
// destructive/accent), это разовая визуальная шкала для одного виджета.
const SEGMENT_COLORS = ["bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-green-500"] as const;

export interface PasswordStrengthMeterProps {
  /** 0 = не соответствует минимуму длины (валидация уже отдельно сообщает об этом), 1..4 — сила. */
  strength: 0 | 1 | 2 | 3 | 4;
  /** Подпись уровня ("Слабый"/"Отличный" и т.п.) — не рендерим на strength=0, чтобы не дублировать
   *  уже показанную рядом ошибку валидации "минимум N символов". */
  label?: string;
}

export function PasswordStrengthMeter({ strength, label }: PasswordStrengthMeterProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1" role="presentation">
        {SEGMENT_COLORS.map((color, i) => (
          <div
            key={color}
            className={cn("h-1 flex-1 rounded-full transition-colors", i < strength ? color : "bg-muted")}
          />
        ))}
      </div>
      {label && <p className="text-xs text-muted-foreground">{label}</p>}
    </div>
  );
}
