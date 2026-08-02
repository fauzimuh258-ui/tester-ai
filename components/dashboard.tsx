// components/dashboard.tsx
"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import CodeScanner from "./code-scanner";
import ApiTester from "./api-tester";

const TABS = [
  { id: "code", label: "Code & Prompt Scanner" },
  { id: "api", label: "API Security Tester" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<TabId>("code");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const idPrefix = useId();

  // WAI-ARIA APG tabs pattern (horizontal, automatic activation):
  // Left/Right moves focus between tabs and activates the target tab;
  // Home/End jump to the first/last tab. Enter/Space activation is native
  // <button> behavior and needs no extra handling here.
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight") {
      nextIndex = (index + 1) % TABS.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + TABS.length) % TABS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = TABS.length - 1;
    }

    if (nextIndex !== null) {
      event.preventDefault();
      setActiveTab(TABS[nextIndex].id);
      tabRefs.current[nextIndex]?.focus();
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          Tester AI Engine
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-xl mx-auto">
          Automated AI Security Testing, Code Auditing & Vulnerability Scanner
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Jenis pengujian keamanan"
        className="flex justify-center border-b border-slate-200 dark:border-slate-800"
      >
        <div className="flex gap-4 sm:gap-6">
          {TABS.map((tab, index) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  tabRefs.current[index] = el;
                }}
                id={`${idPrefix}-tab-${tab.id}`}
                role="tab"
                type="button"
                aria-selected={isActive}
                aria-controls={`${idPrefix}-panel-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                className={`px-1 pb-3 text-xs font-medium border-b-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 ${
                  isActive
                    ? "border-cyan-500 text-cyan-600 dark:text-cyan-400"
                    : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* <div role="tabpanel">, not <main> — app/page.tsx already provides
          the page's <main> landmark; a second one here would give screen
          reader users two conflicting "main" regions. */}
      {TABS.map((tab) => {
        if (tab.id !== activeTab) return null;
        return (
          <div
            key={tab.id}
            id={`${idPrefix}-panel-${tab.id}`}
            role="tabpanel"
            aria-labelledby={`${idPrefix}-tab-${tab.id}`}
            tabIndex={0}
          >
            {tab.id === "code" ? <CodeScanner /> : <ApiTester />}
          </div>
        );
      })}
    </div>
  );
    }
