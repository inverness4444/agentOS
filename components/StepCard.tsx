import { Card, CardContent } from "@/components/ui/card";

type StepCardProps = {
  index: number;
  title: string;
  description: string;
};

export default function StepCard({ index, title, description }: StepCardProps) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EEF0FF] text-sm font-semibold text-[#2B2C4B]">
          0{index}
        </div>
        <h3 className="mt-4 text-lg font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-[#2B2C4B]">{description}</p>
      </CardContent>
    </Card>
  );
}
