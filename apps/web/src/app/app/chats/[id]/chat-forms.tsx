"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";

import { CLOSURE_TEMPLATES, CONNECTS, DRAFT_COPY, renderClosureTemplate } from "@plusone/config";

import { cancelPlan, closeChat, confirmPlan, proposePlan, sendMessage } from "./actions";
import { CHAT_INITIAL } from "./state";
import { buttonClass, iconButtonClass } from "@/app/ui";
import { ACCEPTED_TYPES } from "@/lib/photo-limits";
import { downscalePhoto } from "@/lib/downscale";
import { CalendarIcon, PhotoIcon } from "./chat-icons";
import { CloseIcon, Modal } from "@/app/modal";

const C = DRAFT_COPY.app;

function Error({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-[11.3px] text-critical">
      {message}
    </p>
  );
}

/** Where an unsent line waits. One key per chat, so two drafts never collide. */
const draftKey = (chatId: string) => `plusone:draft:${chatId}`;

export function Composer({ chatId, pickerId }: { chatId: string; pickerId: string }) {
  const [state, act, pending] = useActionState(sendMessage, CHAT_INITIAL);
  const [body, setBody] = useState("");

  /**
   * A photograph, attached before it is sent.
   *
   * Deliberately previewed rather than sent on selection. A picture in a chat
   * cannot be unsent — §5.2 makes messages immutable and there is no undo
   * anywhere in this product — so the one moment a member can still change
   * their mind is between choosing the file and pressing Send, and a composer
   * that skips that moment has removed the only one there is.
   */
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  // Revoked on replacement and on unmount: a blob: URL is held by the document
  // until it is, and a member attaching six photographs in a row would leave
  // five decoded images alive for the life of the tab.
  useEffect(() => {
    if (!image) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  function clearImage() {
    setImage(null);
    if (picker.current) picker.current.value = "";
  }

  /**
   * A half-written message survives leaving the screen.
   *
   * Every navigation away threw it out — the safety controls, the profile
   * behind the name, a notification, the back button. On this product that is
   * worse than the usual annoyance: what people are part-way through writing
   * here is often the hard paragraph, and losing it once is a reason not to
   * write it again.
   *
   * localStorage rather than a cookie or the server. The text has not been sent
   * and the decision to send it has not been made, so it should not leave the
   * device — a draft on a server is a message somebody never chose to share.
   */
  useEffect(() => {
    setBody(window.localStorage.getItem(draftKey(chatId)) ?? "");
  }, [chatId]);

  useEffect(() => {
    if (body) window.localStorage.setItem(draftKey(chatId), body);
    else window.localStorage.removeItem(draftKey(chatId));
  }, [chatId, body]);

  /**
   * Cleared after a send that worked, and only then.
   *
   * Not on submit: the action can fail, and wiping the field on a send that did
   * not happen is the same loss with a worse cause. And not on "no error"
   * alone, because CHAT_INITIAL is also {error: null} — that test is true on
   * mount, so it would throw away the draft this component had just restored.
   *
   * This watched `pending` go true and then false instead, which is the same
   * mistake wearing a disguise: React can batch those two renders, and when it
   * does, `pending: true` is never observed and nothing clears. The box kept
   * the message that had just been sent, with the photograph still attached to
   * it — and the draft in localStorage was never removed either, so leaving the
   * screen and coming back restored it.
   *
   * `state.sent` is a fresh number on every success. It cannot equal the
   * initial state and it cannot be batched away.
   */
  useEffect(() => {
    if (!state.sent) return;
    setBody("");
    setImage(null);
    if (picker.current) picker.current.value = "";
  }, [state.sent]);

  return (
    <form
      action={async (formData) => {
        // Shrunk in the browser, before it crosses anybody's mobile data. The
        // server resizes to 1600px anyway, so sending a 12MB camera original is
        // carrying it across a phone connection to have it thrown away at the
        // other end.
        //
        // An optimisation, not a trust boundary: the server still checks the
        // type and the size, still strips the metadata, still re-encodes.
        const file = formData.get("image");
        if (file instanceof File && file.size > 0) {
          setPreparing(true);
          try {
            formData.set("image", (await downscalePhoto(file)).file);
          } finally {
            setPreparing(false);
          }
        }
        act(formData);
      }}
      className="mt-6 flex flex-col gap-3"
    >
      <input type="hidden" name="chat_id" value={chatId} />

      {/* Shown before it is sent, which is the whole point: a photograph in a
          chat cannot be unsent, so this is the last moment it is still a
          choice. */}
      {preview ? (
        <figure className="relative self-start">
          {/* Not next/image: a blob: URL for a file that has not left the
              device, so there is nothing to optimise and no width to know. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt={image?.name ?? C.chatImageAlt}
            decoding="async"
            className="h-[160px] w-auto max-w-full rounded-xl border border-line-2 bg-surface object-contain"
          />
          <figcaption className="mt-2 flex items-center gap-3 text-[11px] text-ink-3">
            <span className="max-w-[20ch] truncate">{image?.name}</span>
            <button
              type="button"
              onClick={clearImage}
              className="ease-brand underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink"
            >
              {C.postImageRemove}
            </button>
          </figcaption>
        </figure>
      ) : null}

      {/* The control itself, kept inside the form and out of sight.
          Its button lives in the row below, beside the microphone, and reaches
          it by id — a <label for> works anywhere in the document, whereas a
          file input outside the form it feeds is a file that never gets posted.
          sr-only rather than hidden, so it stays in the tab order. */}
      <input
        ref={picker}
        id={pickerId}
        type="file"
        name="image"
        // The types the server will actually take. A member picking something
        // else would otherwise get as far as the upload before being told.
        accept={ACCEPTED_TYPES.join(",")}
        onChange={(event) => setImage(event.target.files?.[0] ?? null)}
        aria-label={C.postImageLabel}
        className="sr-only"
      />

      <div className="flex gap-3">
        <input
          name="body"
          type="text"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          // Pressing Send on an empty field did nothing at all: the action
          // early-returned {error: null}, so there was no error, no message and
          // no change. Sighted members saw nothing happen; everyone else heard
          // nothing happen.
          //
          // Not required once a photograph is attached: a picture with no
          // caption is a message, and messages_has_content agrees.
          required={image === null}
          maxLength={4000}
          placeholder={C.messagePlaceholder}
          // A placeholder is not a label: it is gone the moment a character is
          // typed, so a member who tabs back lands on an unnamed field. This is
          // the primary messaging control of the product.
          aria-label={C.messagePlaceholder}
          /* min-w-0: a flex item's default min-width is `auto`, which for a text
             input resolves to its intrinsic control width (~234px). At 320px
             that pushed Send off the right edge with nothing to scroll to, so
             the composer could not be used at all on a small phone.
             is gone too — globals.css defines the keyboard
             focus ring the accessibility gate requires, and this cancelled it. */
          className="min-w-0 flex-1 rounded-lg border border-line-control bg-surface px-4 py-2.5 text-[16px] focus:border-accent"
        />
        <button type="submit" disabled={pending || preparing} className={buttonClass("primary")}>
          {C.sendLabel}
        </button>
      </div>
      <Error message={state.error} />
    </form>
  );
}

/**
 * The photo button, for the row the microphone is in.
 *
 * Separate from the Composer's form because that is where it belongs on the
 * screen and a form cannot contain another one — VoiceRecorder is its own. It
 * drives the Composer's file input by id, which is what <label for> is for.
 */
export function PhotoButton({ pickerId }: { pickerId: string }) {
  return (
    <label
      htmlFor={pickerId}
      title={C.postImageLabel}
      className={`${iconButtonClass("secondary")} cursor-pointer`}
    >
      <PhotoIcon />
    </label>
  );
}

/**
 * The date plan (§6.2).
 *
 * Three fields, all required — a plan is concrete or it is not a plan. Vague
 * agreement to "do something sometime" is exactly what the fuse exists to stop
 * counting as progress.
 */
export function ProposePlan({ chatId }: { chatId: string }) {
  const [state, act, pending] = useActionState(proposePlan, CHAT_INITIAL);
  const [open, setOpen] = useState(false);

  // Collapsed until asked for. Three empty fields sitting under every open chat
  // read as something the product wants from you before you have said anything
  // — and §6.2 is explicit that vague agreement is what the fuse exists to stop
  // counting as progress, which means the form is for a conversation that has
  // already got somewhere.
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        className={buttonClass("secondary", "inline-flex items-center gap-2")}
      >
        <CalendarIcon />
        {C.proposeToggleLabel}
      </button>
    );
  }

  return (
    <form
      action={act}
      className="rise-in flex w-full flex-col gap-4 rounded-xl border border-line-2 bg-surface p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-[0.931rem]">{C.proposeHeading}</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={C.decisionDismiss}
          className="ease-brand -mt-1 -mr-1 flex size-tap items-center justify-center rounded-lg text-ink-3 transition-colors duration-200 hover:text-ink"
        >
          <CloseIcon />
        </button>
      </div>

      <input type="hidden" name="chat_id" value={chatId} />

      {[
        { name: "date", label: C.planDateLabel, type: "date" },
        { name: "time", label: C.planTimeLabel, type: "text" },
        { name: "place", label: C.planPlaceLabel, type: "text" },
      ].map((field) => (
        <label key={field.name} className="flex flex-col gap-2 text-[11.3px] text-ink-2">
          {field.label}
          <input
            name={field.name}
            type={field.type}
            required
            className="rounded-lg border border-line-2 bg-ground px-3.5 py-2.5 text-[16px] focus:border-accent"
          />
        </label>
      ))}

      <Error message={state.error} />

      <button type="submit" disabled={pending} className={buttonClass("primary", "self-start")}>
        {C.proposeLabel}
      </button>
    </form>
  );
}

export function ConfirmPlan({ chatId, canConfirm }: { chatId: string; canConfirm: boolean }) {
  const [confirmState, confirm, confirming] = useActionState(confirmPlan, CHAT_INITIAL);

  return (
    <div className="mt-8 flex flex-col gap-4 rounded-xl border border-line-2 bg-surface p-6">
      {canConfirm ? (
        <form action={confirm}>
          <input type="hidden" name="chat_id" value={chatId} />
          <button type="submit" disabled={confirming} className={buttonClass("primary")}>
            {C.confirmPlanLabel}
          </button>
        </form>
      ) : (
        // The fuse keeps running while a proposal sits unconfirmed. A plan one
        // person likes is not a plan.
        <p className="text-[12.2px] text-ink-2">{C.awaitingConfirmation}</p>
      )}

      <Error message={confirmState.error} />
    </div>
  );
}

/**
 * Cancelling a plan both people confirmed (§6.2).
 *
 * Split out of ConfirmPlan, which is the only reason it never worked. The
 * cancel control lived inside that component, and ConfirmPlan rendered only
 * when the chat was NOT date_planned — while cancel_date_plan refuses unless it
 * IS. Exact complements: the control was mounted precisely where the RPC always
 * refused, and absent from the one state where it succeeds. §6.2 says a
 * cancelled plan returns the chat to the fuse; there was no way to reach it.
 */
export function CancelPlan({ chatId }: { chatId: string }) {
  const [cancelState, cancel, cancelling] = useActionState(cancelPlan, CHAT_INITIAL);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const confirmId = useId();

  return (
    <div className="mt-8 flex flex-col gap-4 rounded-xl border border-line-2 bg-surface p-6">
      {/* Asked first. This was a one-tap submit that discarded a plan both
          people had confirmed — the single most valuable thing in the chat —
          sitting a few pixels under the button that confirms it.

          Blocking is deliberately unguarded and this is deliberately not: a
          block is reversible from Settings and is reached at the worst moment
          someone will have here, where a cancelled plan means going back to the
          other person and asking again.

          The trigger stays MOUNTED while the confirmation is open. It used to be
          the other branch of a ternary, so activating it destroyed the element
          holding focus and dropped the cursor to <body> exactly when the member
          was being asked a question. aria-expanded says what is actually true
          rather than a hard-coded false. */}
      <button
        type="button"
        onClick={() => setConfirmingCancel((open) => !open)}
        aria-expanded={confirmingCancel}
        aria-controls={confirmId}
        className="ease-brand self-start text-[11.7px] text-ink-3 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink"
      >
        {C.cancelPlanLabel}
      </button>

      {confirmingCancel ? (
        <div id={confirmId} className="flex flex-col gap-3">
          <p role="status" className="text-[11.7px] text-ink-2">
            {C.cancelPlanConfirm}
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <form action={cancel}>
              <input type="hidden" name="chat_id" value={chatId} />
              <button type="submit" disabled={cancelling} className={buttonClass("danger")}>
                {C.cancelPlanConfirmLabel}
              </button>
            </form>
            <button
              type="button"
              onClick={() => setConfirmingCancel(false)}
              className="ease-brand text-[11.7px] text-ink-3 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink"
            >
              {C.cancelPlanKeepLabel}
            </button>
          </div>
        </div>
      ) : null}

      <Error message={cancelState.error} />
    </div>
  );
}

/**
 * Closing (§3.5).
 *
 * There is no way to leave without saying something: a template is always
 * selected, and one is checked by default. Nobody gets left on read.
 */
export function CloseChat({ chatId, senderName }: { chatId: string; senderName: string }) {
  const [state, act, pending] = useActionState(closeChat, CHAT_INITIAL);
  const [template, setTemplate] = useState(0);
  const [line, setLine] = useState("");

  // In a modal rather than a disclosure below the trigger. Five closure
  // templates, a free-text line and a live preview needed the room a page
  // bottom gave them and a 232px header menu does not — and the modal replaces
  // the mounted-trigger dance this used to need, because showModal() keeps the
  // trigger mounted by construction rather than by our remembering to.
  return (
    <Modal
      heading={C.closeHeading}
      trigger={C.closeHeading}
      triggerClassName="ease-brand text-left text-[11.7px] text-ink-3 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink"
    >
      <form action={act} className="mt-4 flex flex-col gap-5">
        <input type="hidden" name="chat_id" value={chatId} />

        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-2 text-[11.3px] text-ink-2">{C.closeTemplateLabel}</legend>
          {CLOSURE_TEMPLATES.map((text, index) => (
            <label
              key={text}
              className="ease-brand flex cursor-pointer items-start gap-3 rounded-lg border border-line-2 bg-ground px-3.5 py-3 text-[11.7px] transition-colors duration-200 has-checked:border-accent"
            >
              <input
                type="radio"
                name="template"
                value={index}
                checked={template === index}
                onChange={() => setTemplate(index)}
                className="mt-1 size-[13px] shrink-0 accent-accent"
              />
              {text}
            </label>
          ))}
        </fieldset>

        <label className="flex flex-col gap-2 text-[11.3px] text-ink-2">
          {C.closePersonalLineLabel}
          <input
            name="personal_line"
            type="text"
            maxLength={CONNECTS.personalLineMaxChars}
            value={line}
            onChange={(event) => setLine(event.target.value)}
            className="rounded-lg border border-line-2 bg-ground px-3.5 py-2.5 text-[16px] focus:border-accent"
          />
        </label>

        {/* Exactly what they will receive, before it is sent. Template one
          carries the sender's name, so the preview substitutes it rather than
          showing a member a raw {name} placeholder. */}
        <p className="rounded-lg bg-surface-2 px-4 py-3.5 text-[11.7px] leading-[1.6] text-ink-2">
          {renderClosureTemplate(template, senderName)}
          {line ? ` ${line}` : ""}
        </p>

        <Error message={state.error} />

        <button type="submit" disabled={pending} className={buttonClass("primary", "self-start")}>
          {C.closeLabel}
        </button>
      </form>
    </Modal>
  );
}
