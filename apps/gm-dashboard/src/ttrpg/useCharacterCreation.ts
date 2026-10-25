import { isCharacter } from "../../../../packages/contracts/dist/index.js";
import { readHostResponse } from "./read-host-response";
import { useState } from "react";
import { apiFetch } from "../../../session-client";

export function useCharacterCreation() {
const [newCharacterName, setNewCharacterName] = useState("");

const [newCharacterClass, setNewCharacterClass] = useState("");

const [newCharacterLevel, setNewCharacterLevel] = useState(1);

const [newCharacterMaxHp, setNewCharacterMaxHp] = useState(10);

const [newCharacterAc, setNewCharacterAc] = useState(10);

const [newCharacterImage, setNewCharacterImage] = useState<string | null>(null);

const [creatingCharacter, setCreatingCharacter] = useState(false);

function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setNewCharacterImage(reader.result as string);
    reader.readAsDataURL(file);
  }

async function createCharacter() {
    if (!newCharacterName.trim() || !newCharacterClass.trim()) return;
    setCreatingCharacter(true);
    try {
      const body: Record<string, unknown> = {
        name: newCharacterName.trim(),
        classLabel: newCharacterClass.trim(),
        maxHp: newCharacterMaxHp,
        armorClass: newCharacterAc,
        level: newCharacterLevel,
        notes: [`Created at level ${newCharacterLevel}`]
      };
      if (newCharacterImage) body.image = newCharacterImage;
      const res = await apiFetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        await readHostResponse(res, isCharacter);
        setNewCharacterName("");
        setNewCharacterClass("");
        setNewCharacterLevel(1);
        setNewCharacterMaxHp(10);
        setNewCharacterAc(10);
        setNewCharacterImage(null);
      }
    } catch {
      /* ignore */
    } finally {
      setCreatingCharacter(false);
    }
  }
return { newCharacterName, setNewCharacterName, newCharacterClass, setNewCharacterClass, newCharacterLevel, setNewCharacterLevel, newCharacterMaxHp, setNewCharacterMaxHp, newCharacterAc, setNewCharacterAc, newCharacterImage, setNewCharacterImage, creatingCharacter, setCreatingCharacter, handleImagePick, createCharacter };
}
