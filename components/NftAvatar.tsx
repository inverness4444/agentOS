import Image from "next/image";
import { cn } from "@/lib/utils";

type NftAvatarProps = {
  seed: string;
  size?: number;
  className?: string;
  photo?: string | null;
  alt?: string;
};

export default function NftAvatar({
  seed,
  size = 64,
  className,
  photo,
  alt
}: NftAvatarProps) {
  const hasPhoto = typeof photo === "string" && photo.length > 0;

  return (
    <div
      className={cn(
        "flex items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm",
        className
      )}
      style={{ width: size, height: size }}
    >
      {hasPhoto ? (
        <Image
          src={photo}
          alt={alt ?? `Фото агента ${seed}`}
          width={size}
          height={size}
          sizes={`${size}px`}
          className="h-full w-full rounded-[inherit] object-cover"
        />
      ) : null}
    </div>
  );
}
