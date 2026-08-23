import LandingNav from '@/components/landing/LandingNav';
import Hero from '@/components/landing/Hero';
import LiveStats from '@/components/landing/LiveStats';
import PricingSection from '@/components/landing/PricingSection';
import RuntimesSection from '@/components/landing/RuntimesSection';
import WhyChooseSection from '@/components/landing/WhyChooseSection';
import LocationsSection from '@/components/landing/LocationsSection';
import ReviewsSection from '@/components/landing/ReviewsSection';
import FaqSection from '@/components/landing/FaqSection';
import DiscordCta from '@/components/landing/DiscordCta';

// Phase 5 — Landing Page. Every dynamic section (pricing, runtimes, live
// stats) reads from the existing backend APIs (GET /plans, GET /runtimes,
// GET /stats) rather than hardcoding data — see REVIEW.md for the specific
// endpoints each section calls and why. Locations/Reviews/FAQ stay
// presentational, matching the feature-source panel this was migrated
// from, since there's no backend model for regions/testimonials/FAQ yet.
export default function Home() {
  return (
    <>
      <LandingNav />
      <main className="relative overflow-hidden">
        <Hero />
        <LiveStats />
        <PricingSection />
        <RuntimesSection />
        <WhyChooseSection />
        <LocationsSection />
        <ReviewsSection />
        <FaqSection />
        <DiscordCta />
      </main>
    </>
  );
}
