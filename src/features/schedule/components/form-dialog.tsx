"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export function FormDialog(props: {
  open: boolean;
  onClose: () => void;
  title: string;
  error: string | null;
  pending: boolean;
  onSubmit: () => void;
  extraAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = useTranslations("common");

  return (
    <Dialog open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle className="text-lg">{props.title}</DialogTitle>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            props.onSubmit();
          }}
        >
          {props.children}
          {props.error && (
            <p role="alert" className="text-sm text-destructive">
              {props.error}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {props.extraAction && <div className="mr-auto">{props.extraAction}</div>}
            <Button type="button" variant="outline" className="h-11 px-4" onClick={props.onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={props.pending} className="h-11 px-4">
              {props.pending ? t("saving") : t("save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
