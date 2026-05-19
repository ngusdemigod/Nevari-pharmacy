import "./globals.css";
import AppProviders from "./components/AppProviders";

export const metadata = {
  title: "Nevari Dashboard",
  description: "Nevari dashboard and pairing experience."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body><AppProviders>{children}</AppProviders></body>
    </html>
  );
}
