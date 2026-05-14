import "./globals.css";

export const metadata = {
  title: "Nevari Admin Storefront",
  description: "Next.js storefront admin frontend for Nevari pharmacy operations."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
