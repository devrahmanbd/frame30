import React, { useRef, useState, useEffect } from "react";
import gsap from "gsap";
import { cn } from "@/lib/utils";
import { TESTIMONIALS } from "@/lib/marketing/testimonials.content";

const IMAGES = [
  "https://images.unsplash.com/photo-1556761175-5973dc0f32b7?q=80&w=800&auto=format&fit=crop", // Business man standing
  "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=800&auto=format&fit=crop", // Business woman standing
  "https://images.unsplash.com/photo-1556760544-74068565f05c?q=80&w=800&auto=format&fit=crop", // Business team/man
  "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?q=80&w=800&auto=format&fit=crop", // Business woman crossed arms
];

const CARD_COLORS = [
  "bg-[#e1fca1]", // Light lime green
  "bg-[#e0e7ff]", // Light indigo
  "bg-[#fef08a]", // Soft yellow
  "bg-[#fce7f3]", // Light pink
  "bg-[#dcfce7]", // Light emerald
];

export function TestimonialList() {
  const cases = TESTIMONIALS.cases;
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const isAnimating = useRef(false);

  const goToSlide = (newIndex: number, direction: "left" | "right") => {
    if (isAnimating.current || newIndex === activeIndex) return;
    isAnimating.current = true;

    const currentSlide = containerRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    const nextSlide = containerRef.current?.querySelector(`[data-index="${newIndex}"]`);

    if (!currentSlide || !nextSlide) {
      isAnimating.current = false;
      return;
    }

    const ctx = gsap.context(() => {
      const xOffset = direction === "right" ? 30 : -30;
      
      // Prepare next slide
      gsap.set(nextSlide, { autoAlpha: 0, x: xOffset, zIndex: 20 });
      gsap.set(currentSlide, { zIndex: 10 });

      const tl = gsap.timeline({
        onComplete: () => {
          setActiveIndex(newIndex);
          isAnimating.current = false;
          // Clear GSAP styles so React/Tailwind state takes back over cleanly for responsiveness
          gsap.set([currentSlide, nextSlide], { clearProps: "all" });
        }
      });

      tl.to(currentSlide, { autoAlpha: 0, x: -xOffset, duration: 0.5, ease: "power2.inOut" }, 0)
        .to(nextSlide, { autoAlpha: 1, x: 0, duration: 0.5, ease: "power2.inOut" }, 0.1);
    }, containerRef);
  };

  const handleNext = () => {
    goToSlide((activeIndex + 1) % cases.length, "right");
  };

  const handlePrev = () => {
    goToSlide((activeIndex - 1 + cases.length) % cases.length, "left");
  };

  useEffect(() => {
    const timer = setInterval(() => {
      handleNext();
    }, 8000);
    return () => clearInterval(timer);
  }, [activeIndex]);

  return (
    <div className="mt-12 md:mt-20 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      
      {/* Responsive Grid Stacking Layout - Naturally sizes to tallest slide */}
      <div 
        ref={containerRef} 
        className="grid grid-cols-1 grid-rows-1 w-full relative"
      >
        {cases.map((current, i) => {
          const isActive = i === activeIndex;
          const bgColor = CARD_COLORS[i % CARD_COLORS.length];

          return (
            <div
              key={current.id}
              data-index={i}
              aria-hidden={!isActive}
              className={cn(
                "col-start-1 row-start-1 flex flex-col md:flex-row items-stretch gap-6 lg:gap-10 p-3 sm:p-4 lg:p-6 rounded-[2rem] md:rounded-[3rem] w-full",
                bgColor
              )}
              style={{
                opacity: isActive ? 1 : 0,
                visibility: isActive ? "visible" : "hidden",
                zIndex: isActive ? 10 : 0
              }}
            >
              {/* Photo Side */}
              <div className="relative w-full md:w-[42%] lg:w-[45%] shrink-0 min-h-[280px] sm:min-h-[350px] md:min-h-0 rounded-[1.5rem] md:rounded-[2.5rem] overflow-hidden">
                <img
                  src={IMAGES[i % IMAGES.length]}
                  alt={current.merchant}
                  className="absolute inset-0 w-full h-full object-cover"
                  loading="lazy"
                />
              </div>

              {/* Content Side */}
              <div className="flex flex-col justify-center w-full md:w-[58%] lg:w-[55%] py-4 md:py-8 lg:py-12 pr-4 md:pr-10 lg:pr-16">
                
                {/* Big Blue Quote Icon */}
                <svg width="40" height="40" viewBox="0 0 24 24" fill="#4b40ff" xmlns="http://www.w3.org/2000/svg" className="mb-6 lg:mb-8 shrink-0">
                  <path d="M9 13.9996V20.9996H2V13.9996C2 10.1336 5.134 6.99963 9 6.99963V9.99963C7.343 9.99963 6 11.3426 6 12.9996V13.9996H9ZM22 13.9996V20.9996H15V13.9996C15 10.1336 18.134 6.99963 22 6.99963V9.99963C20.343 9.99963 19 11.3426 19 12.9996V13.9996H22Z" />
                </svg>

                {/* Highly Legible, Medium Weight Quote Text */}
                <h3 className="text-[1.35rem] sm:text-2xl md:text-3xl lg:text-[2.5rem] font-medium text-[#16161D] leading-[1.3] md:leading-[1.15] tracking-tight mb-8 lg:mb-12">
                  {current.quote}
                </h3>

                {/* Author Block */}
                <div className="flex items-center gap-4 mt-auto">
                  <div>
                    <h4 className="text-base md:text-xl font-semibold text-[#16161D] leading-tight mb-0.5">
                      {current.merchant}
                    </h4>
                    <p className="text-sm md:text-base text-[#16161D]/70">
                      {current.sector} · {current.city}
                    </p>
                  </div>
                </div>

              </div>
            </div>
          );
        })}
      </div>

      {/* Navigation Controls */}
      <div className="flex items-center justify-center relative mt-8 md:mt-10 px-2 md:px-6">
        {/* Progress Dots */}
        <div className="flex gap-2">
          {cases.map((_, i) => (
            <button
              key={i}
              onClick={() => {
                if (i > activeIndex) goToSlide(i, "right");
                else if (i < activeIndex) goToSlide(i, "left");
              }}
              className={cn(
                "h-1.5 rounded-full transition-all duration-500",
                activeIndex === i ? "w-6 bg-foreground/40" : "w-1.5 bg-foreground/10 hover:bg-foreground/20"
              )}
            />
          ))}
        </div>
        
        {/* Arrows */}
        <div className="flex gap-3 absolute right-2 md:right-6">
          <button 
            onClick={handlePrev}
            className="flex size-11 md:size-12 items-center justify-center rounded-full border border-border bg-background hover:bg-muted text-foreground transition-all active:scale-95 text-lg font-medium"
          >
            ←
          </button>
          <button 
            onClick={handleNext}
            className="flex size-11 md:size-12 items-center justify-center rounded-full border border-border bg-background hover:bg-muted text-foreground transition-all active:scale-95 text-lg font-medium"
          >
            →
          </button>
        </div>
      </div>
      
    </div>
  );
}
