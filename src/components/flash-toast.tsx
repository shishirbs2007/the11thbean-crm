"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

export function FlashToast() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");

    if (success) toast.success(success);
    if (error) toast.error(error);

    if (success || error) {
      router.replace(pathname, { scroll: false });
    }
  }, [pathname, router, searchParams]);

  return null;
}
