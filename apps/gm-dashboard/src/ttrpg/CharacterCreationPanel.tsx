import React from "react";
import type { useCharacterCreation } from "./useCharacterCreation";

export function CharacterCreationPanel({ controller }: { controller: ReturnType<typeof useCharacterCreation> }) {
const { newCharacterName, setNewCharacterName, newCharacterClass, setNewCharacterClass, newCharacterLevel, setNewCharacterLevel, newCharacterMaxHp, setNewCharacterMaxHp, newCharacterAc, setNewCharacterAc, newCharacterImage, creatingCharacter, handleImagePick, createCharacter } = controller;
return (<article className="panel panel-wide">
          <div className="panel-header">
            <h2>Quick Add Character</h2>
            <span>Name + Class + Stats</span>
          </div>
          <div className="character-form">
            <div className="character-form-row">
              <div style={{ flex: 2 }}>
                <label className="label">Name *</label>
                <input value={newCharacterName} onChange={(e) => setNewCharacterName(e.target.value)} placeholder="Character name" />
              </div>
              <div>
                <label className="label">Class *</label>
                <input value={newCharacterClass} onChange={(e) => setNewCharacterClass(e.target.value)} placeholder="Fighter, Wizard..." />
              </div>
              <div>
                <label className="label">Level</label>
                <input type="number" value={newCharacterLevel} onChange={(e) => setNewCharacterLevel(Number(e.target.value))} min={1} max={20} />
              </div>
            </div>
            <div className="character-form-row">
              <div>
                <label className="label">Max HP</label>
                <input type="number" value={newCharacterMaxHp} onChange={(e) => setNewCharacterMaxHp(Number(e.target.value))} min={1} />
              </div>
              <div>
                <label className="label">AC</label>
                <input type="number" value={newCharacterAc} onChange={(e) => setNewCharacterAc(Number(e.target.value))} min={1} />
              </div>
            </div>
            <div className="character-form-row" style={{ alignItems: "center" }}>
              <div>
                <label className="label">Portrait Image</label>
                <input type="file" accept="image/*" onChange={handleImagePick} style={{ maxWidth: 220 }} />
              </div>
              {newCharacterImage ? (
                <img src={newCharacterImage} alt="Preview" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 6, border: "2px solid #555" }} />
              ) : null}
            </div>
            <button
              className="primary-button"
              disabled={!newCharacterName.trim() || !newCharacterClass.trim() || creatingCharacter}
              onClick={() => void createCharacter()}
              type="button"
            >
              {creatingCharacter ? "Creating..." : "Create Character"}
            </button>
          </div>
        </article>);
}
