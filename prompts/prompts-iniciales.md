# Prompts iniciales — Suite de tests unitarios para inserción de candidatos

Este documento recoge los prompts utilizados para generar la suite de tests
unitarios de la funcionalidad de inserción de candidatos (`backend/src/tests/tests-iniciales.test.ts`),
usando **Jest** + **ts-jest** y **mock de Prisma**.

El asistente de IA empleado ha sido **Claude (Claude Code)** integrado en el IDE.

Los prompts están redactados como plantillas reutilizables: siguiendo este guion
se puede reconstruir una suite equivalente sobre el mismo código base.

> **Principio aplicado (regla de oro del módulo):** el humano define *el qué*
> (qué comportamientos se prueban y qué se espera), la IA implementa *el cómo*
> (la sintaxis de los tests). Los tests nunca se aceptan sin revisión.

---

## 1. Prompt de contexto y exploración

```text
Vamos a crear una suite de tests unitarios en Jest para la funcionalidad de
insertar candidatos del backend (un ATS). Antes de escribir nada, explora el
código relevante (solo lectura):

- La función de validación de datos del formulario.
- El servicio que orquesta el alta de candidato.
- El modelo de dominio que persiste en base de datos vía Prisma.
- El schema de Prisma.

Resume qué hace cada pieza y qué comportamientos serían relevantes de testear.
No escribas tests todavía.
```

**Por qué:** dar contexto real al asistente antes de pedir código evita que
"alucine" tests sobre un código que no ha leído. El entendimiento del flujo
(validación → servicio → modelo → Prisma) es la base de toda la suite.

---

## 2. Prompt de planteamiento (definición del *qué*)

```text
Quiero cubrir las dos familias de tests que pide el ejercicio:

A) Recepción / validación de los datos del formulario (sin base de datos).
B) Guardado en base de datos (mockeando Prisma, sin tocar Postgres real).

Para la familia A quiero: un camino feliz completo, un camino feliz solo con
campos obligatorios, y casos de error para email, nombre, teléfono, fecha de
educación y CV. Añade también un test que documente que, si se pasa un `id`,
la validación se omite por completo (comportamiento real del código).

Para la familia B quiero: guardado correcto que devuelve el candidato con su id,
verificación de los datos enviados a Prisma, manejo del email duplicado (P2002),
y un test que confirme que con datos inválidos no se llega a llamar a Prisma.

Aplica buenas prácticas: nombres descriptivos, patrón Arrange-Act-Assert y
parametrización con test.each donde tenga sentido.
```

**Por qué:** aquí el humano fija el alcance y los casos concretos. Es la decisión
de diseño más importante y es deliberadamente humana, no delegada a la IA.

---

## 3. Prompt para los tests de validación (familia A)

```text
Escribe los tests de la familia A en inglés (código en inglés).

- Crea un helper buildValidCandidate(overrides) que devuelva un candidato válido
  y permita sobrescribir solo el campo que cada test quiere romper, para que la
  razón del fallo sea evidente.
- Camino feliz: candidato completo válido y candidato solo con obligatorios.
- Casos de error con test.each en formato de objeto ({ case, override, message })
  para que el nombre del test muestre el caso y el mensaje esperado sin ambigüedad.
- Test del atajo del id: datos inválidos + id presente → no lanza.

Usa el patrón Arrange-Act-Assert y para "no lanza" usa
expect(() => ...).not.toThrow().
```

**Por qué:** el helper y el `test.each` con objetos son decisiones de calidad
(legibilidad y mantenibilidad). Se especifica el formato de objeto explícitamente
porque el formato de array posicional confunde los `%s` del nombre del test.

---

## 4. Prompt para el mock de Prisma (familia B)

```text
Ahora los tests de la familia B (guardado en BD). El modelo crea un PrismaClient
a nivel de módulo (const prisma = new PrismaClient()), así que mockea el módulo
'@prisma/client' completo con jest.mock.

Ten en cuenta el hoisting de jest.mock: las funciones espía deben crearse DENTRO
de la factory del mock (no como variables externas, que estarían undefined al
ejecutarse la factory). Luego recupéralas haciendo new PrismaClient() para poder
configurarlas y verificarlas desde los tests.

Mantén también el namespace Prisma con una clase dummy
PrismaClientInitializationError para que los instanceof del modelo no fallen.

Añade un beforeEach con jest.clearAllMocks() para aislar los tests.
```

**Por qué:** este prompt incorpora el conocimiento técnico clave (hoisting de
`jest.mock`) que es la principal fuente de error al mockear módulos con cliente
instanciado a nivel de módulo. Anticiparlo evita el ciclo de prueba-error.

---

## 5. Prompt para los casos de guardado (familia B)

```text
Escribe estos cuatro tests de guardado:

1. addCandidate con datos válidos → llama a prisma.candidate.create una vez y
   devuelve el candidato con su id (usa mockResolvedValue).
2. Verifica que a Prisma se le pasan los campos correctos, usando
   toHaveBeenCalledWith + expect.objectContaining para no acoplarse a la forma
   exacta del objeto.
3. Si Prisma rechaza con un error de código 'P2002', addCandidate debe lanzar
   "The email already exists in the database" (usa mockRejectedValue y
   .rejects.toThrow).
4. Con datos inválidos, addCandidate lanza y prisma.candidate.create NO se llama
   (expect(...).not.toHaveBeenCalled()).
```

**Por qué:** se prueban comportamiento observable (qué devuelve, qué error lanza)
en lugar de detalles de implementación. `objectContaining` mantiene el test
robusto frente a cambios menores en el modelo.

---

## 6. Prompt de revisión y limpieza

```text
Revisa el resultado:
- Asegúrate de que los nombres de los tests parametrizados muestran el mensaje
  esperado, no el objeto de override.
- Elimina las variables/espías de mock que no se usen.
- Confirma que toda la suite pasa en verde con npm test.
```

**Por qué:** la revisión crítica es parte del método. En este ejercicio se
detectaron y corrigieron dos problemas reales: (1) el formato de `test.each` que
mostraba el objeto en vez del mensaje, y (2) el `TypeError: prisma.candidate.create
is not a function` causado por el hoisting del mock. Ambos se vieron *fallar*
antes de corregirse — práctica recomendada de TDD ("ver el test en rojo").

---

## Nota de transparencia sobre el proceso

El trabajo real se desarrolló de forma **conversacional y guiada paso a paso**:
el alumno tomó todas las decisiones de diseño (alcance, casos, estrategia de
mock, idioma del código) y revisó cada bloque antes de aceptarlo, corrigiendo
manualmente lo necesario. Los prompts anteriores son la destilación reutilizable
de ese proceso. Ningún test se aceptó sin entender su funcionamiento, y los dos
fallos encontrados se resolvieron comprendiendo la causa, no parcheando a ciegas.
