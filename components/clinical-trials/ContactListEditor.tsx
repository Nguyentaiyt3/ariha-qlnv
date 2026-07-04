"use client";

import { Trash2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClinicalTrialContact } from "@/types";

interface Props {
  label: string;
  contacts: ClinicalTrialContact[];
  onChange: (contacts: ClinicalTrialContact[]) => void;
  className?: string;
}

export function ContactListEditor({ label, contacts, onChange, className }: Props) {
  const inputCls = "w-full px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none";

  // Normalize contacts to always be array
  const contactsArray = Array.isArray(contacts) ? contacts : [];

  const handleAddContact = () => {
    onChange([...contactsArray, { name: "", phone: "", email: "" }]);
  };

  const handleRemoveContact = (idx: number) => {
    onChange(contactsArray.filter((_, i) => i !== idx));
  };

  const handleUpdateContact = (idx: number, field: keyof ClinicalTrialContact, value: string) => {
    const updated = [...contactsArray];
    updated[idx] = { ...updated[idx], [field]: value };
    onChange(updated);
  };

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-3">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</label>
        <button
          type="button"
          onClick={handleAddContact}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition"
        >
          <Plus className="w-3 h-3" />
          Thêm
        </button>
      </div>

      <div className="space-y-2.5">
        {contactsArray.length === 0 ? (
          <p className="text-xs text-slate-400 italic">Chưa có thông tin</p>
        ) : (
          contactsArray.map((contact, idx) => (
            <div
              key={idx}
              className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded p-3 space-y-2"
            >
              {/* Name Row */}
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Tên</label>
                <input
                  type="text"
                  value={contact.name ?? ""}
                  onChange={(e) => handleUpdateContact(idx, "name", e.target.value)}
                  placeholder="Tên người liên hệ"
                  className={inputCls}
                />
              </div>

              {/* Phone & Email Row */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">SĐT</label>
                  <input
                    type="tel"
                    value={contact.phone ?? ""}
                    onChange={(e) => handleUpdateContact(idx, "phone", e.target.value)}
                    placeholder="0123456789"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Email</label>
                  <input
                    type="email"
                    value={contact.email ?? ""}
                    onChange={(e) => handleUpdateContact(idx, "email", e.target.value)}
                    placeholder="email@example.com"
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Delete Button */}
              <button
                type="button"
                onClick={() => handleRemoveContact(idx)}
                className={cn(
                  "w-full flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition"
                )}
              >
                <Trash2 className="w-3 h-3" />
                Xoá
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
