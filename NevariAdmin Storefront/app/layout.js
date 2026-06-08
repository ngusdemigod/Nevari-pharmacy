import localFont from "next/font/local";
import "./globals.css";
import AppProviders from "./components/AppProviders";

const productSans = localFont({
  src: [
    {
      path: "../public/fonts/ProductSans-Regular.ttf",
      weight: "400",
      style: "normal"
    },
    {
      path: "../public/fonts/ProductSans-Italic.ttf",
      weight: "400",
      style: "italic"
    },
    {
      path: "../public/fonts/ProductSans-Bold.ttf",
      weight: "700",
      style: "normal"
    },
    {
      path: "../public/fonts/ProductSans-BoldItalic.ttf",
      weight: "700",
      style: "italic"
    }
  ],
  variable: "--font-product-sans",
  display: "swap"
});

export const metadata = {
  title: "Nevari Dashboard",
  description: "Nevari dashboard and pairing experience."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning className={productSans.variable}>
      <body><AppProviders>{children}</AppProviders></body>
    </html>
  );
}
