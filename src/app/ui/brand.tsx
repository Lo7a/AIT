// המותג "בדק עסק" (הכרעת מייסד 26.8): הפנים של הדמות במקום אריח האותיות, והשם
// כטקסט חי בטוקנים של המערכת - לא תמונה - כדי שיישאר חד בכל גודל ויתהפך נכון בין
// מצב כהה לבהיר. רכיב משותף לכל שורות המותג במוצר: ניווט, כניסה, סריקה, נחיתה.

/** תמונת הדמות בטבעת - הסמל הקטן של המותג. דקורטיבית, השם נישא בטקסט שלידה */
export function BrandFace({ size = 34 }: { size?: number }) {
  return (
    <img
      src="/brand/avatar.webp"
      alt=""
      width={size}
      height={size}
      className="brand-face"
      aria-hidden="true"
    />
  );
}

/** השם בשני צבעים ונקודת הברקת - הגרסה הטקסטואלית של הוורדמארק */
export function BrandName() {
  return (
    <b className="brand-name">
      בדק <span>עסק</span>
      <span className="brand-dot" aria-hidden="true" />
    </b>
  );
}
