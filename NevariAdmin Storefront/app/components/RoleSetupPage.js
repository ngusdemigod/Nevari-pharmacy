"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { setDocumentMetadata } from "./page-metadata";

export default function RoleSetupPage({ config }) {
  const router = useRouter();

  useEffect(() => {
    setDocumentMetadata(`${config.label} | Dashboard Login`, `Redirecting to ${config.label} login.`);
    router.replace(config.loginPath);
  }, [config.label, config.loginPath, router]);

  return null;
}
