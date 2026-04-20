interface IdeassionLogoProps {
  className?: string;
  height?: number;
}

export function IdeassionLogo({ className, height = 36 }: IdeassionLogoProps) {
  return (
    <img
      src="/ideassion-logo.png"
      alt="Ideassion — Intelligence. Delivered."
      height={height}
      style={{ height, width: "auto" }}
      className={className}
    />
  );
}
