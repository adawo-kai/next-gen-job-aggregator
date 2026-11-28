from __future__ import annotations

import io

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import User
from app.pipeline import skills as sk
from app.pipeline.normalize import FORMATS, GRADES, detect_grade
from app.security import current_user

router = APIRouter(prefix="/profile", tags=["profile"])


class ProfileIO(BaseModel):
    desired_salary: int | None = Field(None, ge=0)
    currency: str = "RUB"
    grade: str | None = None
    work_formats: list[str] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    stop_words: list[str] = Field(default_factory=list)
    city: str | None = None


def to_out(u: User) -> dict:
    return ProfileIO(desired_salary=u.desired_salary, currency=u.currency or "RUB", grade=u.grade,
                     work_formats=u.work_formats or [], skills=u.skills or [], stop_words=u.stop_words or [],
                     city=u.city).model_dump()


@router.get("")
async def get_profile(user: User = Depends(current_user)):
    return to_out(user)


@router.put("")
async def put_profile(body: ProfileIO, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    if body.grade and body.grade not in GRADES:
        raise HTTPException(422, "Неизвестный грейд")
    bad = [f for f in body.work_formats if f not in FORMATS]
    if bad:
        raise HTTPException(422, f"Неизвестный формат работы: {', '.join(bad)}")
    user.desired_salary = body.desired_salary
    user.currency = body.currency.upper()
    user.grade = body.grade
    user.work_formats = body.work_formats
    user.skills = sk.normalize_list(body.skills)
    user.stop_words = [w.strip() for w in body.stop_words if w.strip()]
    user.city = body.city
    await session.commit()
    return to_out(user)


def extract_text(name: str, data: bytes) -> str:
    low = name.lower()
    if low.endswith(".pdf"):
        from pypdf import PdfReader

        return "\n".join(p.extract_text() or "" for p in PdfReader(io.BytesIO(data)).pages)
    if low.endswith(".docx"):
        import docx

        return "\n".join(p.text for p in docx.Document(io.BytesIO(data)).paragraphs)
    return data.decode("utf-8", errors="ignore")


@router.post("/resume", summary="Upload resume (pdf/docx/txt or JSON {text}) -> skills extracted into profile")
async def upload_resume(request: Request, file: UploadFile | None = File(None),
                        user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    if file is not None:
        data = await file.read()
        if len(data) > 5 * 1024 * 1024:
            raise HTTPException(413, "Файл больше 5 МБ")
        text = extract_text(file.filename or "resume.txt", data)
    else:
        try:
            body = await request.json()
            text = str(body.get("text", ""))
        except Exception:
            raise HTTPException(422, "Прикрепите файл резюме или вставьте текст")
    if len(text.strip()) < 20:
        raise HTTPException(422, "Не удалось прочитать резюме: файл пустой или это скан без текста")
    found = sk.extract(text)
    grade = detect_grade(text[:200], text, None)
    user.skills = list(dict.fromkeys([*(user.skills or []), *found]))
    if grade and not user.grade:
        user.grade = grade
    await session.commit()
    return {"extracted_skills": found, "grade_guess": grade, "profile": to_out(user)}
