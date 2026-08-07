import { cn } from "@helix/ui";

// Исходный /img/helix_logo.png — квадратный холст 1024×1024, где сам лого-блок (иконка + "HELIX
// CRM") занимает лишь центральные 68.75%×37.5% (измерено по bounding box непрозрачных пикселей) —
// вокруг сплошное прозрачное поле. Наивный <img className="h-N"> увеличивает только это поле, не
// сам лого. Кропаем точно по границам контента через overflow:hidden + отрицательные отступы,
// чтобы контейнер высотой `height` реально показывал лого такой высоты, без полей.
const LOGO_CROP = { top: 320 / 1024, left: 160 / 1024, width: 704 / 1024, height: 384 / 1024 };

export function BrandLogo({ height = 44, className }: { height?: number; className?: string }) {
  const fullSize = height / LOGO_CROP.height;
  const width = LOGO_CROP.width * fullSize;

  return (
    <span
      className={cn("inline-block overflow-hidden", className)}
      style={{ width, height }}
    >
      <img
        src="/img/helix_logo.png"
        alt="Helix CRM"
        style={{
          width: fullSize,
          height: fullSize,
          maxWidth: "none",
          marginLeft: -(LOGO_CROP.left * fullSize),
          marginTop: -(LOGO_CROP.top * fullSize),
        }}
      />
    </span>
  );
}
