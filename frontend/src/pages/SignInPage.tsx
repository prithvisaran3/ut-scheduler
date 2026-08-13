import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Navigate, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { SignInScheduleGraphic } from "../components/auth/SignInScheduleGraphic";
import { strings } from "../content/strings";
import { ApiError } from "../api/client";
import { useLogin, useLogout } from "../hooks/useAuth";
import { useAuthStore } from "../store/authStore";
import type { UserRole } from "../types/auth";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type FormValues = z.infer<typeof schema>;

/**
 * Role toggle decision:
 * Backend `/auth/login` embeds the user's DB role in the JWT — the client cannot
 * escalate privileges. The Patient/Admin toggle is an intent selector: after a
 * successful login we compare token.role to the toggle. Mismatch → clear session
 * and show an error (patient credentials cannot open the admin panel).
 */
export function SignInPage() {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.role);
  const login = useLogin();
  const logout = useLogout();
  const navigate = useNavigate();
  const [intendedRole, setIntendedRole] = useState<UserRole>("patient");
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  if (token && role) {
    return <Navigate to={role === "admin" ? "/admin" : "/book"} replace />;
  }

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const data = await login.mutateAsync(values);
      if (data.role !== intendedRole) {
        logout();
        setFormError(strings.signIn.roleMismatch);
        return;
      }
      navigate(data.role === "admin" ? "/admin" : "/book", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 0) {
          setFormError(strings.signIn.networkError);
        } else if (err.status === 401) {
          setFormError(strings.signIn.error);
        } else if (err.status >= 500) {
          setFormError(err.message || strings.signIn.serverError);
        } else {
          setFormError(err.message || strings.signIn.error);
        }
        return;
      }
      setFormError(strings.signIn.networkError);
    }
  });

  return (
    <div className="flex min-h-screen w-full">
      <aside className="relative flex min-h-screen w-1/2 flex-col bg-[var(--color-navy-950)] p-12">
        <div
          className="font-semibold tracking-[-0.01em] text-[var(--color-white)]"
          style={{ fontSize: "var(--text-16)" }}
        >
          {strings.appName}
        </div>

        <div className="flex flex-1 flex-col justify-center gap-14">
          <SignInScheduleGraphic />
          <p
            className="max-w-[380px] font-normal text-[var(--color-navy-100)]"
            style={{ fontSize: "var(--text-14)", lineHeight: 1.5 }}
          >
            {strings.signIn.tagline}
          </p>
        </div>

        <div
          className="font-medium uppercase tracking-[0.06em] text-[var(--color-navy-600)]"
          style={{ fontSize: "var(--text-11)" }}
        >
          {strings.signIn.network}
        </div>
      </aside>

      <main className="flex min-h-screen w-1/2 items-center justify-center bg-[var(--color-white)] px-8">
        <form className="flex w-full max-w-[360px] flex-col gap-6" onSubmit={onSubmit} noValidate>
          <div className="flex flex-col gap-1.5">
            <h1
              className="font-semibold tracking-[-0.01em] text-[var(--color-ink)]"
              style={{ fontSize: "var(--text-30)", lineHeight: 1.2 }}
            >
              {strings.signIn.title}
            </h1>
            <p
              className="font-normal text-[var(--color-grey-500)]"
              style={{ fontSize: "var(--text-14)", lineHeight: 1.5 }}
            >
              {strings.signIn.subtitle}
            </p>
          </div>

          <div
            className="flex gap-1 rounded-[var(--radius-lg)] bg-[var(--color-grey-100)] p-1"
            role="tablist"
            aria-label={strings.signIn.roleToggleAria}
          >
            {(["patient", "admin"] as const).map((r) => {
              const active = intendedRole === r;
              const label =
                r === "patient" ? strings.signIn.rolePatient : strings.signIn.roleAdmin;
              return (
                <button
                  key={r}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setIntendedRole(r);
                    setFormError(null);
                  }}
                  className={`flex-1 rounded-[var(--radius-md)] py-2 text-center font-medium transition ${
                    active
                      ? "bg-[var(--color-white)] text-[var(--color-ink)] shadow-[var(--shadow-xs)]"
                      : "bg-transparent text-[var(--color-grey-500)]"
                  }`}
                  style={{ fontSize: "var(--text-13)" }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-3.5">
            <label className="flex flex-col gap-1.5">
              <span
                className="font-medium uppercase tracking-[0.06em] text-[var(--color-grey-700)]"
                style={{ fontSize: "var(--text-12)" }}
              >
                {strings.signIn.emailLabel}
              </span>
              <input
                type="email"
                autoComplete="username"
                aria-invalid={Boolean(errors.email)}
                className="h-10 rounded-[var(--radius-md)] border border-[var(--color-grey-200)] bg-[var(--color-white)] px-3 text-[var(--color-ink)] shadow-[var(--shadow-xs)] outline-none focus:border-[var(--color-navy-600)]"
                style={{ fontSize: "var(--text-14)" }}
                {...register("email")}
              />
              {errors.email ? (
                <span
                  className="text-[var(--color-salmon-700)]"
                  style={{ fontSize: "var(--text-12)" }}
                  role="alert"
                >
                  {errors.email.message}
                </span>
              ) : null}
            </label>

            <label className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between">
                <span
                  className="font-medium uppercase tracking-[0.06em] text-[var(--color-grey-700)]"
                  style={{ fontSize: "var(--text-12)" }}
                >
                  {strings.signIn.passwordLabel}
                </span>
                <span
                  className="text-[var(--color-grey-500)]"
                  style={{ fontSize: "var(--text-12)" }}
                >
                  {strings.signIn.forgot}
                </span>
              </div>
              <input
                type="password"
                autoComplete="current-password"
                aria-invalid={Boolean(errors.password)}
                className="h-10 rounded-[var(--radius-md)] border border-[var(--color-grey-300)] bg-[var(--color-white)] px-3 tracking-[0.18em] text-[var(--color-grey-700)] shadow-[var(--shadow-xs)] outline-none focus:border-[var(--color-navy-600)]"
                style={{ fontSize: "var(--text-14)" }}
                {...register("password")}
              />
              {errors.password ? (
                <span
                  className="text-[var(--color-salmon-700)]"
                  style={{ fontSize: "var(--text-12)" }}
                  role="alert"
                >
                  {errors.password.message}
                </span>
              ) : null}
            </label>
          </div>

          {formError ? (
            <p
              className="rounded-[var(--radius-md)] border border-[var(--color-salmon-200)] bg-[var(--color-salmon-50)] px-3 py-2 text-[var(--color-salmon-700)]"
              style={{ fontSize: "var(--text-13)", lineHeight: 1.4 }}
              role="alert"
            >
              {formError}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={login.isPending}>
            {login.isPending ? strings.common.loading : strings.signIn.submit}
          </Button>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-[var(--color-grey-200)]" />
            <span
              className="font-medium uppercase tracking-[0.06em] text-[var(--color-grey-300)]"
              style={{ fontSize: "var(--text-11)" }}
            >
              {strings.signIn.or}
            </span>
            <div className="h-px flex-1 bg-[var(--color-grey-200)]" />
          </div>

          <button
            type="button"
            className="flex h-11 w-full items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-grey-200)] bg-[var(--color-white)] font-medium text-[var(--color-navy-900)]"
            style={{ fontSize: "var(--text-14)" }}
          >
            {strings.signIn.sso}
          </button>

          <p
            className="text-center font-normal text-[var(--color-grey-500)]"
            style={{ fontSize: "var(--text-12)", lineHeight: 1.5 }}
          >
            {strings.signIn.help}
          </p>
        </form>
      </main>
    </div>
  );
}
