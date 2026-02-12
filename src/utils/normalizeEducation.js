export function normalizeEducationArray(education = []) {
  return education.map((e) =>
    e.eduType === "Other" && e.eduTypeOther?.trim()
      ? { ...e, eduType: e.eduTypeOther.trim() }
      : e
  );
}
