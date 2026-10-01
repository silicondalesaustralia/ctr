"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./CampaignRowMenu.module.css";

interface Props {
  label: string;
  isActive: boolean;
  onStart: () => void;
  onStop: () => void;
  onDelete: () => void;
}

const MENU_WIDTH = 150;

export default function CampaignRowMenu({ label, isActive, onStart, onStop, onDelete }: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  function toggle() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect || position) {
      setPosition(null);
      return;
    }
    setPosition({ top: rect.bottom + 6, left: Math.max(8, rect.right - MENU_WIDTH) });
  }

  useEffect(() => {
    if (!position) return;
    menuRef.current?.querySelector("button")?.focus();
    const close = () => setPosition(null);
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      close();
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [position]);

  function choose(action: () => void) {
    setPosition(null);
    action();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-label={`More actions for ${label}`}
        aria-haspopup="menu"
        aria-expanded={position !== null}
        onClick={toggle}
      >
        ⋯
      </button>
      {position && (
        <div ref={menuRef} role="menu" className={styles.menu} style={position}>
          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={() => choose(isActive ? onStop : onStart)}
          >
            {isActive ? "Stop campaign" : "Start campaign"}
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.danger}
            onClick={() => choose(onDelete)}
          >
            Delete campaign
          </button>
        </div>
      )}
    </>
  );
}
