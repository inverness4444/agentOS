import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/format";
import Link from "next/link";

type PricingCardProps = {
  price: number;
  currency: string;
  badge: string;
  title?: string;
  compact?: boolean;
  className?: string;
};

export default function PricingCard({
  price,
  currency,
  badge,
  title = "ДОСТУП",
  compact = false,
  className
}: PricingCardProps) {
  return (
    <Card className={cn("rounded-3xl", className)}>
      <CardContent className={cn("p-6", compact && "p-5")}>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="glow" className="tracking-[0.25em]">
            {title}
          </Badge>
          <Badge variant="accent">{badge}</Badge>
        </div>
        <div className="mt-6 flex items-end gap-3">
          <span className="text-4xl font-semibold tracking-tight text-[#2B2C4B]">
            {formatPrice(price)} {currency}
          </span>
        </div>
        <p className={cn("mt-3 text-sm text-[#2B2C4B]", compact && "text-[13px]")}>
          Полный доступ ко всем агентам, обновлениям и сценариям.
        </p>
        <div className={cn("mt-6 flex flex-wrap gap-3", compact && "mt-4")}>
          <Button asChild size={compact ? "md" : "lg"}>
            <Link href="/register">Получить доступ</Link>
          </Button>
          <Button asChild variant="secondary" size={compact ? "md" : "lg"}>
            <Link href="/demo">Запросить демо</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
