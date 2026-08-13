import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  ShieldCheckBoldDuotone,
  CheckCircleBoldDuotone,
  CloseCircleBoldDuotone
} from "solar-icon-set";
import type { EducationSlide } from "@/services/education.service";
import { OnboardingStepper } from "@/components/OnboardingStepper";

// Map string icon names from DB to actual Solar icons
const IconMap: Record<string, React.ReactNode> = {
  shield: <ShieldCheckBoldDuotone size={48} className="text-primary" />,
  user: <ShieldCheckBoldDuotone size={48} className="text-primary" />,
  document: <ShieldCheckBoldDuotone size={48} className="text-primary" />,
  briefcase: <ShieldCheckBoldDuotone size={48} className="text-primary" />,
  network: <ShieldCheckBoldDuotone size={48} className="text-primary" />,
  clock: <ShieldCheckBoldDuotone size={48} className="text-primary" />,
  close: <ShieldCheckBoldDuotone size={48} className="text-primary" />,
};

interface EducationModuleProps {
  slides: EducationSlide[];
  onComplete: () => Promise<void> | void;
  isCompleting?: boolean;
  completionError?: string | null;
}

export function EducationModule({
  slides,
  onComplete,
  isCompleting = false,
  completionError = null,
}: EducationModuleProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!slides || slides.length === 0) return null;

  const currentSlide = slides[currentIndex];
  const isLastSlide = currentIndex === slides.length - 1;
  const progressPct = ((currentIndex + 1) / slides.length) * 100;

  const handleNext = () => {
    if (currentIndex < slides.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <OnboardingStepper currentKey="education" className="mb-6" />
      <div className="mb-8 text-center space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Know Your Rights</h1>
        <p className="text-muted-foreground text-sm">
          Please review the following principles under the Digital Personal Data Protection Act, 2023.
        </p>
      </div>

      <Progress value={progressPct} className="h-2 mb-6" />

      <Card className="border-t-4 border-t-primary shadow-lg min-h-[400px] flex flex-col relative overflow-hidden">
        {/* Background decorative element */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
        
        <CardHeader className="text-center pt-10 pb-2">
          <div className="mx-auto bg-primary/10 w-24 h-24 rounded-full flex items-center justify-center mb-4">
            {IconMap[currentSlide.icon] || <ShieldCheckBoldDuotone size={48} className="text-primary" />}
          </div>
          <CardTitle className="text-2xl">{currentSlide.title}</CardTitle>
          <CardDescription>Slide {currentIndex + 1} of {slides.length}</CardDescription>
        </CardHeader>
        
        <CardContent className="flex-1 flex items-center justify-center px-8 text-center">
          <p className="text-lg leading-relaxed text-foreground/90">
            {currentSlide.content}
          </p>
        </CardContent>

        <CardFooter className="flex justify-between items-center bg-muted/20 border-t p-4 mt-auto">
          <Button 
            variant="ghost" 
            onClick={handlePrev} 
            disabled={currentIndex === 0 || isCompleting}
            className="gap-2"
          >
            Back
          </Button>
          
          {isLastSlide ? (
            <Button 
              size="lg"
              className="gap-2 bg-success hover:bg-success/90 text-success-foreground shadow-md animate-in fade-in slide-in-from-bottom-2"
              onClick={onComplete}
              disabled={isCompleting}
            >
              <CheckCircleBoldDuotone size={20} />
              {isCompleting ? "Saving..." : "I Understand & Acknowledge"}
            </Button>
          ) : (
            <Button 
              size="lg"
              onClick={handleNext} 
              disabled={isCompleting}
              className="gap-2"
            >
              Next
            </Button>
          )}
        </CardFooter>
        {completionError && (
          <div className="px-4 pb-4 text-sm text-destructive text-center">
            {completionError}
          </div>
        )}
      </Card>
    </div>
  );
}
