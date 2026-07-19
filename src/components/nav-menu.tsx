"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
} from "react";

type NavLink = readonly [href: string, label: string];

type NavGroup = {
  label: string;
  links: readonly NavLink[];
};

export function NavMenu({
  primary,
  groups,
}: {
  primary: readonly NavLink[];
  groups: readonly NavGroup[];
}) {
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpenGroup(null);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenGroup(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex flex-wrap items-center gap-2"
    >
      {primary.map(([href, label]) => {
        const active =
          pathname === href ||
          (href !== "/dashboard" && pathname.startsWith(`${href}/`));

        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpenGroup(null)}
            className={`rounded-lg px-2 py-1 transition ${
              active
                ? "bg-neutral-900 text-white"
                : "hover:bg-neutral-100"
            }`}
          >
            {label}
          </Link>
        );
      })}

      {groups.map((group) => {
        const open = openGroup === group.label;
        const containsActiveRoute = group.links.some(
          ([href]) =>
            pathname === href || pathname.startsWith(`${href}/`),
        );

        return (
          <div key={group.label} className="relative">
            <button
              type="button"
              aria-expanded={open}
              aria-haspopup="menu"
              onClick={() =>
                setOpenGroup((current) =>
                  current === group.label ? null : group.label,
                )
              }
              className={`rounded-lg px-2 py-1 transition ${
                open || containsActiveRoute
                  ? "bg-neutral-900 text-white"
                  : "hover:bg-neutral-100"
              }`}
            >
              {group.label}
            </button>

            {open && (
              <div
                role="menu"
                className="absolute right-0 z-50 mt-2 min-w-52 rounded-xl border bg-white p-2 text-neutral-900 shadow-lg"
              >
                {group.links.map(([href, label]) => {
                  const active =
                    pathname === href ||
                    pathname.startsWith(`${href}/`);

                  return (
                    <Link
                      key={href}
                      href={href}
                      role="menuitem"
                      onClick={() => setOpenGroup(null)}
                      className={`block rounded-lg px-3 py-2 ${
                        active
                          ? "bg-neutral-900 text-white"
                          : "hover:bg-neutral-100"
                      }`}
                    >
                      {label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
