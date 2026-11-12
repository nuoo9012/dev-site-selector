import type { Metadata } from "next";
import { Gowun_Dodum, Jua } from "next/font/google";
import "./globals.css";

// 부드러운 글씨체: 본문은 '고운돋움'(둥글고 편한 고딕), 제목은 '주아'(통통한 둥근 글씨)
// 한글 글꼴은 조각으로 나뉘어 필요한 글자만 내려받는다. 못 받아도 시스템 글꼴로 대신 보인다 (globals.css).
const body = Gowun_Dodum({ weight: "400", subsets: ["latin"], preload: false, display: "swap", variable: "--font-body" });
const title = Jua({ weight: "400", subsets: ["latin"], preload: false, display: "swap", variable: "--font-title" });

export const metadata: Metadata = {
  title: "나라땅 줍줍단",
  description: "서울 25개 구에서 면적·지목·용도지역 조건에 맞는 개발 대상지를 골라 줍니다.",
  // 팀 내부용 도구라 검색엔진에 나오지 않게 한다 (주소가 쉽게 알려지는 것을 막음)
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${body.variable} ${title.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
