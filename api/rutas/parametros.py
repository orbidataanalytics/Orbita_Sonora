from typing import Annotated

from fastapi import Depends, HTTPException, Query


def validar_niveles(niveles: Annotated[int, Query(description="4, 8 o 16 niveles por banda")] = 8) -> int:
    if niveles not in (4, 8, 16):
        raise HTTPException(status_code=422, detail="Los niveles por banda deben ser 4, 8 o 16")
    return niveles


Niveles = Annotated[int, Depends(validar_niveles)]
