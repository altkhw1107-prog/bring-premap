import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og.png`;

  return {
    title: "BRING Pre-Map | 공간을 이해하는 로봇 도입 사전진단",
    description: "시설과 대표 경로를 바탕으로 BRING 로봇 서비스 조합, 공간 조건, 예비 비용과 기대효용을 미리 확인하세요.",
    openGraph: {
      title: "BRING Pre-Map",
      description: "공간을 이해하면, 도입은 더 선명해집니다.",
      type: "website",
      images: [{ url: imageUrl, width: 1731, height: 909, alt: "BRING Pre-Map 로봇 도입 사전진단" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "BRING Pre-Map",
      description: "공간을 이해하면, 도입은 더 선명해집니다.",
      images: [imageUrl],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
