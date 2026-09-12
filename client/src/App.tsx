import { useEffect, useMemo, useState } from "react";
import { GamePhase, type ActionResult, type DistrictCard, type DistrictColor, type PrivatePlayerState, type PublicRoomState, type RoleDefinition, type SessionData } from "@citadel/shared";
import { socket } from "./socket/socket";

const STORAGE_KEY = "crown-city-session";
const queryCode = new URLSearchParams(location.search).get("room")?.toUpperCase() ?? "";
const ROLE_ART: Record<string, string> = {
  assassin: "/card-art/assassin.png",
  thief: "/card-art/thief.png",
  magician: "/card-art/magician.png",
  king: "/card-art/king-v3.png",
  bishop: "/card-art/bishop.png",
  merchant: "/card-art/merchant.png",
  architect: "/card-art/architect.png",
  warlord: "/card-art/warlord.png"
};
const DISTRICT_ART: Record<string, string> = {
  market: "/card-art/market.png",
  harbor: "/card-art/harbor.png",
  chapel: "/card-art/chapel-v2.png",
  abbey: "/card-art/abbey.png",
  watch: "/card-art/watch.png",
  fort: "/card-art/fort.png",
  manor: "/card-art/manor.png",
  palace: "/card-art/palace.png",
  observatory: "/card-art/observatory.png",
  library: "/card-art/library.png",
  smithy: "/card-art/smithy.png",
  laboratory: "/card-art/laboratory.png",
  keep: "/card-art/keep.png",
  graveyard: "/card-art/graveyard.png",
  great_wall: "/card-art/great-wall.png",
  school_of_magic: "/card-art/school-of-magic.png",
  map_room: "/card-art/map-room.png",
  imperial_treasury: "/card-art/imperial-treasury.png",
  haunted_city: "/card-art/haunted-city.png",
  university: "/card-art/university.png",
  dragon_gate: "/card-art/dragon-gate.png",
  garden: "/card-art/garden.png"
};
const DISTRICT_COLOR_LABEL: Record<DistrictColor, string> = { NOBLE: "귀족", RELIGIOUS: "종교", TRADE: "상업", MILITARY: "군사", UNIQUE: "특수" };
const CARD_GLOSSARY: Record<string, readonly { term: string; description: string }[]> = {
  observatory: [{ term: "카드 수입", description: "턴 시작에 금화 2개 대신 카드 수입을 고르는 선택입니다." }, { term: "손패", description: "아직 건설하지 않은, 나만 볼 수 있는 건물 카드입니다." }],
  library: [{ term: "카드 수입", description: "턴 시작에 금화 2개 대신 카드 수입을 고르는 선택입니다." }, { term: "손패", description: "아직 건설하지 않은, 나만 볼 수 있는 건물 카드입니다." }],
  smithy: [{ term: "턴마다", description: "내 차례에 이 효과 건물을 한 번 사용할 수 있습니다." }, { term: "설계도", description: "손패로 들어오는 건물 카드입니다." }],
  laboratory: [{ term: "손패", description: "아직 건설하지 않은, 나만 볼 수 있는 건물 카드입니다." }],
  keep: [{ term: "장군", description: "군사 역할의 파괴 능력을 사용하는 플레이어입니다." }],
  graveyard: [{ term: "회수", description: "파괴된 건물을 버리지 않고 내 손패로 다시 가져오는 것입니다." }],
  great_wall: [{ term: "파괴 비용", description: "장군이 건물을 파괴하려고 낼 금화입니다." }],
  school_of_magic: [{ term: "색상 수입", description: "내 도시의 같은 색 건물 수만큼 금화를 받는 역할 수입입니다." }],
  map_room: [{ term: "게임 종료", description: "누군가 도시 완성 조건을 달성한 라운드가 끝난 뒤 점수를 계산하는 때입니다." }, { term: "손패", description: "아직 건설하지 않은, 나만 볼 수 있는 건물 카드입니다." }],
  imperial_treasury: [{ term: "게임 종료", description: "누군가 도시 완성 조건을 달성한 라운드가 끝난 뒤 점수를 계산하는 때입니다." }],
  haunted_city: [{ term: "색상 완성", description: "귀족·종교·상업·군사·특수의 다섯 색 건물을 모두 갖춘 상태입니다." }],
  university: [{ term: "게임 종료", description: "누군가 도시 완성 조건을 달성한 라운드가 끝난 뒤 점수를 계산하는 때입니다." }],
  dragon_gate: [{ term: "게임 종료", description: "누군가 도시 완성 조건을 달성한 라운드가 끝난 뒤 점수를 계산하는 때입니다." }],
  garden: [{ term: "고유 건물", description: "한 도시에는 같은 고유 건물을 한 번만 건설할 수 있습니다." }]
};

export function App() {
  const [nickname, setNickname] = useState(localStorage.getItem("crown-city-nickname") ?? "");
  const [roomCode, setRoomCode] = useState(queryCode);
  const [session, setSession] = useState<SessionData | null>(() => readSession());
  const [room, setRoom] = useState<PublicRoomState | null>(null);
  const [privateState, setPrivateState] = useState<PrivatePlayerState | null>(null);
  const [message, setMessage] = useState("");
  const [copyNotice, setCopyNotice] = useState("");
  const [showRulesGuide, setShowRulesGuide] = useState(false);
  const [connected, setConnected] = useState(socket.connected);
  const [wonderCard, setWonderCard] = useState<DistrictCard | null>(null);

  useEffect(() => {
    if (!wonderCard) return;
    const timer = window.setTimeout(() => setWonderCard(null), 1_800);
    return () => window.clearTimeout(timer);
  }, [wonderCard]);

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      const saved = readSession();
      if (saved && nickname) join(saved.roomCode, saved.playerToken, true);
    };
    const onDisconnect = () => setConnected(false);
    const onRoom = (state: PublicRoomState) => setRoom(state);
    const onPrivate = (state: PrivatePlayerState) => setPrivateState(state);
    const onChat = (chat: PublicRoomState["chat"][number]) => setRoom((current) => current && (current.chat.some((item) => item.id === chat.id) ? current : { ...current, chat: [...current.chat, chat] }));
    const onError = (error: string) => setMessage(error);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("room:state", onRoom);
    socket.on("player:private", onPrivate);
    socket.on("chat:message", onChat);
    socket.on("game:error", onError);
    if (socket.connected && session && nickname && !room) join(session.roomCode, session.playerToken, true);
    return () => {
      socket.off("connect", onConnect); socket.off("disconnect", onDisconnect);
      socket.off("room:state", onRoom); socket.off("player:private", onPrivate); socket.off("chat:message", onChat); socket.off("game:error", onError);
    };
  }, []);

  const me = useMemo(() => room?.players.find((player) => player.id === session?.playerId), [room, session]);

  function saveSession(data: SessionData) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    localStorage.setItem("crown-city-nickname", nickname.trim());
    setSession(data);
    history.replaceState(null, "", `?room=${data.roomCode}`);
  }

  function createRoom() {
    setMessage("");
    socket.emit("room:create", nickname, (result) => finish(result, saveSession));
  }

  function join(code = roomCode, playerToken?: string, silent = false) {
    if (!silent) setMessage("");
    socket.emit("room:join", { roomCode: code, nickname, playerToken }, (result) => {
      if (result.ok && result.data) saveSession(result.data);
      else if (!silent) setMessage(result.error ?? "참가하지 못했습니다.");
    });
  }

  function leaveLocal() {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null); setRoom(null); setPrivateState(null);
    history.replaceState(null, "", location.pathname);
    socket.disconnect().connect();
  }

  if (!room || !session) {
    return <main className="landing">
      <section className="hero">
        <div className="crest">♜</div>
        <p className="eyebrow">실시간 전략 보드게임</p>
        <h1>왕관의 도시</h1>
        <p className="subtitle">비밀 역할을 선택하고, 가장 위대한 도시를 세우세요.</p>
        <label>닉네임<input value={nickname} maxLength={16} placeholder="2~16자" onChange={(event) => setNickname(event.target.value)} /></label>
        <div className="joinRow">
          <input aria-label="방 코드" value={roomCode} maxLength={6} placeholder="방 코드" onChange={(event) => setRoomCode(event.target.value.toUpperCase())} />
          <button onClick={() => join()} disabled={!connected}>참가</button>
        </div>
        <div className="divider"><span>또는</span></div>
        <button className="primary wide" onClick={createRoom} disabled={!connected}>새로운 도시 만들기</button>
        <Status connected={connected} message={message} />
      </section>
    </main>;
  }

  const isMyTurn = room.game.currentPlayerId === session.playerId;
  const inviteLocation = new URL(window.location.href);
  inviteLocation.search = `?room=${room.code}`;
  inviteLocation.hash = "";
  const inviteUrl = inviteLocation.toString();

  async function copyInviteUrl() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteUrl);
      } else {
        const fallback = document.createElement("textarea");
        fallback.value = inviteUrl;
        fallback.style.position = "fixed";
        fallback.style.opacity = "0";
        document.body.append(fallback);
        fallback.select();
        const copied = document.execCommand("copy");
        fallback.remove();
        if (!copied) throw new Error("복사할 수 없습니다.");
      }
      setCopyNotice("전체 초대 링크를 복사했습니다.");
    } catch {
      setCopyNotice("복사에 실패했습니다. 방 코드로 참가해 주세요.");
    }
  }

  return <main className="gameShell">
    <header>
      <div><p className="eyebrow">{room.game.phase === GamePhase.LOBBY ? "대기실" : `${room.game.round} 라운드`}</p><h1>{room.name}</h1></div>
      <div className="headerActions"><button className="ghost" onClick={() => setShowRulesGuide(true)}>게임 가이드</button><button className="ghost" onClick={leaveLocal}>나가기</button></div>
    </header>
    {showRulesGuide && <RulesGuide onClose={() => setShowRulesGuide(false)} />}
    <section className="roomBar">
      <div><span>방 코드</span><strong>{room.code}</strong></div>
      <button onClick={copyInviteUrl}>{copyNotice.startsWith("전체") ? "복사됨 ✓" : "초대 링크 복사"}</button>
    </section>
    {copyNotice && <p className="copyNotice" role="status">{copyNotice}</p>}
    <div className="layout">
      <section className="mainPanel">
        {room.game.phase === GamePhase.LOBBY && <Lobby room={room} meId={session.playerId} onReady={() => socket.emit("room:ready", !me?.isReady, finish)} onRoleSet={(id) => socket.emit("room:role-set", id, finish)} onRankNine={(enabled, roleId, customMode) => socket.emit("room:rank-nine", { enabled, roleId, customMode }, finish)} onStart={() => socket.emit("game:start", finish)} />}
        {room.game.phase === GamePhase.ROLE_SELECTION && <RoleSelection room={room} privateState={privateState} onSelect={(id) => socket.emit("role:select", id, finish)} onChoosePair={(roleId, discardRoleId) => socket.emit("role:choose-pair", { roleId, discardRoleId }, finish)} onDiscard={(id) => socket.emit("role:discard", id, finish)} />}
        {room.game.phase === GamePhase.GAME_END && <GameEnd room={room} meId={session.playerId} canRematch={Boolean(me?.isHost)} onRematch={() => socket.emit("game:rematch", finish)} />}
        {[GamePhase.TURN_START, GamePhase.INCOME, GamePhase.ACTION, GamePhase.BUILD, GamePhase.TURN_END].includes(room.game.phase) && <GameBoard
          room={room}
          privateState={privateState}
          isMyTurn={isMyTurn}
          onIncome={(type) => socket.emit("income:take", type, finish)}
          onChooseIncome={(id) => socket.emit("income:choose", id, finish)}
          onBuild={(id, card) => socket.emit("district:build", id, (result) => finish(result, () => {
            if (card.unique) setWonderCard(card);
          }))}
          onDistrictAbility={(payload) => socket.emit("district:ability", payload, finish)}
          onAbility={(targetRoleId) => socket.emit("ability:use", targetRoleId, finish)}
          onColorIncome={(color) => socket.emit("ability:color-income", color, finish)}
          onMagician={(payload) => socket.emit("ability:magician", payload, finish)}
          onWarlord={(payload) => socket.emit("ability:warlord", payload, finish)}
          onScholar={() => socket.emit("ability:scholar", finish)}
          onChooseScholar={(id) => socket.emit("scholar:choose", id, finish)}
          onGraveyardRecover={(recover) => socket.emit("graveyard:recover", recover, finish)}
          onArtist={(id) => socket.emit("ability:artist", id, finish)}
          onSpy={(color) => socket.emit("ability:spy", color, finish)}
          onSeer={(payload) => socket.emit("ability:seer", payload, finish)}
          onWizard={(targetPlayerId) => socket.emit("ability:wizard", targetPlayerId, finish)}
          onMagistrate={(targetPlayerId) => socket.emit("ability:magistrate", targetPlayerId, finish)}
          onEmperor={(targetPlayerId) => socket.emit("ability:emperor", targetPlayerId, finish)}
          onSkipAction={() => socket.emit("action:skip", finish)}
          onEnd={() => socket.emit("turn:end", finish)}
        />}
        <Status connected={connected} message={message} />
      </section>
      <aside>
        <h2>플레이어</h2>
        <div className="playerList">{room.players.map((player) => <div className={`player ${player.id === session.playerId ? "me" : ""}`} key={player.id}>
          <span className={`dot ${player.isConnected ? "online" : ""}`} />
          <span>{player.seatNumber}번 좌석 · {player.nickname}{player.hasCrown && " 👑"}{player.id === session.playerId && " (나)"}</span>
          {player.isHost && <em>방장</em>}{room.game.phase === GamePhase.LOBBY && <b>{player.isReady ? "준비" : "대기"}</b>}
          {room.game.phase !== GamePhase.LOBBY && <small>🪙 {player.gold} · 🃏 {player.handCount} · 🏛️ {player.city.length}</small>}
        </div>)}</div>
        {room.game.logs.length > 0 && <section className="gameLogs"><h2>게임 로그</h2>{room.game.logs.slice(-8).reverse().map((log) => <p key={log.id}><span>R{log.round}</span>{log.message}</p>)}</section>}
        <Chat messages={room.chat} onSend={(message) => socket.emit("chat:send", message, finish)} />
      </aside>
    </div>
    {wonderCard && <WonderConstruction card={wonderCard} />}
  </main>;
}

function Chat({ messages, onSend }: { messages: PublicRoomState["chat"]; onSend: (message: string) => void }) {
  const [message, setMessage] = useState("");
  function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = message.trim();
    if (!value) return;
    onSend(value);
    setMessage("");
  }
  return <section className="gameLogs chat"><h2>채팅</h2><div className="chatMessages">{messages.slice(-30).map((item) => <p key={item.id}><span>{item.nickname}</span>{item.message}</p>)}</div><form onSubmit={submit}><input value={message} maxLength={300} placeholder="메시지 입력" onChange={(event) => setMessage(event.target.value)} /><button>전송</button></form></section>;
}

function Lobby({ room, meId, onReady, onRoleSet, onRankNine, onStart }: { room: PublicRoomState; meId: string; onReady: () => void; onRoleSet: (id: string) => void; onRankNine: (enabled: boolean, roleId: string, customMode: boolean) => void; onStart: () => void }) {
  const me = room.players.find((player) => player.id === meId)!;
  const playerCount = room.players.length;
  const rankNineRequired = playerCount === 3 || playerCount === 8;
  const queenForbidden = playerCount === 3 || playerCount === 4;
  const canStart = me.isHost && playerCount >= 2 && room.players.every((player) => player.isReady) && (!rankNineRequired || room.rankNineEnabled) && !(queenForbidden && room.rankNineEnabled && room.rankNineRoleId === "queen");
  const recommendedRankNineRoleId = room.roleSets.find((set) => set.id === room.roleSetId)!.recommendedRankNineRoleId;
  const chooseRankNineRole = (roleId: string) => onRankNine(true, roleId, roleId !== recommendedRankNineRoleId);
  return <div className="lobbyPanel"><div className="lobbyIntro"><div className="bigIcon">⌛</div><div><h2>플레이어를 기다리는 중</h2><p>직업 세트를 정하고 모두 준비하면 게임을 시작할 수 있습니다.</p></div></div>
    <section className="roleSetSection"><div className="sectionTitle"><h3>이번 게임의 직업 세트</h3><span>{me.isHost ? "방장이 선택할 수 있습니다" : "방장 선택 대기"}</span></div><div className="roleSetGrid">{room.roleSets.map((set) => <button key={set.id} className={`roleSetCard ${room.roleSetId === set.id ? "selected" : ""}`} disabled={!me.isHost || me.isReady} onClick={() => onRoleSet(set.id)}><div><strong>{set.name}</strong>{room.roleSetId === set.id && <em>선택됨</em>}</div><p>{set.description}</p><ol>{set.roles.map((role) => <li key={role.rank}><span>{role.rank}</span>{role.name}</li>)}</ol></button>)}</div></section>
    <section className="rankNineSection"><div className="sectionTitle"><div><h3>9번 직업 모드 · {room.rankNineCustomMode ? "커스텀 조합" : "세트 권장 조합"}</h3><p>3·8인은 필수, 4~7인은 선택입니다. 여왕은 3·4인 게임에서 사용할 수 없습니다.</p></div><button className={room.rankNineEnabled ? "toggle active" : "toggle"} disabled={!me.isHost || me.isReady || rankNineRequired} onClick={() => onRankNine(!room.rankNineEnabled, room.rankNineRoleId, room.rankNineCustomMode)}>{room.rankNineEnabled ? "켜짐" : "꺼짐"}</button></div>{room.rankNineCustomMode && <button className="secondary" disabled={!me.isHost || me.isReady} onClick={() => onRankNine(room.rankNineEnabled, recommendedRankNineRoleId, false)}>권장 조합으로 복귀</button>}<div className="rankNineGrid">{room.rankNineRoles.map((role) => <button key={role.id} className={`rankNineCard ${room.rankNineRoleId === role.id ? "selected" : ""}`} disabled={!me.isHost || me.isReady || !room.rankNineEnabled || (queenForbidden && role.id === "queen")} onClick={() => chooseRankNineRole(role.id)}><strong>9 · {role.name}</strong><span>{role.description}</span></button>)}</div></section>
    <div className="lobbyActions"><button className={me.isReady ? "secondary" : "primary"} onClick={onReady}>{me.isReady ? "준비 취소" : "준비 완료"}</button>
    {me.isHost && <button className="primary" disabled={!canStart} onClick={onStart}>게임 시작</button>}</div>
  </div>;
}

function RoleSelection({ room, privateState, onSelect, onChoosePair, onDiscard }: { room: PublicRoomState; privateState: PrivatePlayerState | null; onSelect: (id: string) => void; onChoosePair: (roleId: string, discardRoleId: string) => void; onDiscard: (id: string) => void }) {
  const picker = room.players.find((player) => player.id === room.game.selectionPlayerId)?.nickname;
  const [pendingDiscardRoleId, setPendingDiscardRoleId] = useState<string | null>(null);
  const faceUpRoles = byRoleRank(room.game.faceUpDiscardedRoles);
  const roleChoices = byRoleRank(privateState?.roleChoices ?? []);
  const rolePairChoices = byRoleRank(privateState?.rolePairChoices ?? []);
  const roleDiscardChoices = byRoleRank(privateState?.roleDiscardChoices ?? []);
  return <div><div className="phaseTitle"><p className="eyebrow">비밀 역할 선택</p><h2>{privateState?.canSelectRole ? "역할을 선택하세요" : `${picker ?? "다른 플레이어"}님의 선택을 기다리는 중`}</h2><p>{room.game.selectedCount} / {room.game.totalSelections} 선택 완료</p></div>
    {faceUpRoles.length > 0 && <section className="actionBox"><h3>이번 라운드 공개 제외 역할</h3><div className="roleGrid">{faceUpRoles.map((role) => <div className={`roleCard role-${role.id}`} key={role.id} style={{ "--role-color": role.color } as React.CSSProperties}><RoleFace role={role} description="이번 라운드에는 사용되지 않습니다." /></div>)}</div></section>}
    {privateState?.canSelectRole && <div className="roleGrid">{roleChoices.map((role) => <button className={`roleCard role-${role.id}`} key={role.id} style={{ "--role-color": role.color } as React.CSSProperties} onClick={() => onSelect(role.id)}><RoleFace role={role} /></button>)}</div>}
    {privateState?.canChooseRolePair && <section className="actionBox"><h3>{pendingDiscardRoleId ? "이제 내 두 번째 역할을 고르세요" : "먼저 비공개로 제외할 역할을 고르세요"}</h3><p>{pendingDiscardRoleId ? "제외한 역할은 누구에게도 공개되지 않습니다. 남은 후보에서 내 역할 한 장을 고르면 두 선택이 함께 확정됩니다." : "원작 2인 규칙: 이번 후보 중 한 장은 비공개 제외하고, 다른 한 장은 내 역할로 보관합니다."}</p><div className="roleGrid">{rolePairChoices.filter((role) => pendingDiscardRoleId ? role.id !== pendingDiscardRoleId : true).map((role) => <button className={`roleCard role-${role.id} ${pendingDiscardRoleId === role.id ? "selected" : ""}`} key={role.id} style={{ "--role-color": role.color } as React.CSSProperties} onClick={() => pendingDiscardRoleId ? (onChoosePair(role.id, pendingDiscardRoleId), setPendingDiscardRoleId(null)) : setPendingDiscardRoleId(role.id)}><RoleFace role={role} description={pendingDiscardRoleId ? "이 역할을 내 두 번째 역할로 보관" : "이 역할을 비공개로 제외"} /></button>)}</div>{pendingDiscardRoleId && <button className="secondary" onClick={() => setPendingDiscardRoleId(null)}>제외 카드 다시 고르기</button>}</section>}
    {privateState?.canDiscardRole && <section className="actionBox"><h3>비공개로 제외할 역할을 고르세요</h3><p>{room.players.length === 2 ? "두 번째 역할 선택에서는 남은 후보 한 장을 비공개로 버립니다." : "세 번째 플레이어는 첫 역할 선택 뒤 후보 한 장을 비공개로 버립니다."}</p><div className="roleGrid">{roleDiscardChoices.map((role) => <button className="roleCard" key={role.id} style={{ "--role-color": role.color } as React.CSSProperties} onClick={() => onDiscard(role.id)}><RoleFace role={role} description="이 역할을 이번 라운드에서 제외" /></button>)}</div></section>}
    {privateState && privateState.selectedRoles.length > 0 && <div className="secret"><span>나의 비밀 역할</span><strong>{privateState.selectedRoles.map((role) => `${role.rank}. ${role.name}`).join(" · ")}</strong></div>}
  </div>;
}

function byRoleRank(roles: readonly RoleDefinition[]) {
  return [...roles].sort((left, right) => left.rank - right.rank);
}

function RulesGuide({ onClose }: { onClose: () => void }) {
  return <div className="rulesOverlay" role="dialog" aria-modal="true" aria-labelledby="rules-title">
    <section className="rulesGuide">
      <div className="sectionTitle"><div><p className="eyebrow">처음 하는 사람을 위한</p><h2 id="rules-title">게임 가이드</h2></div><button className="ghost" onClick={onClose}>닫기</button></div>
      <div className="rulesGrid">
        <article><h3>1. 승리 목표</h3><p>도시의 건물 점수를 가장 많이 모으면 승리합니다. 2~3인은 누군가 8채, 4~8인은 7채를 지으면 이번 라운드가 끝난 뒤 점수를 계산합니다.</p></article>
        <article><h3>2. 한 라운드의 흐름</h3><p>비밀 역할 선택 → 역할 번호 순서대로 턴 진행 → 다음 라운드입니다. 낮은 번호 역할부터 차례가 오며, 선택한 역할은 다른 플레이어에게 공개되지 않습니다.</p></article>
        <article><h3>3. 내 턴</h3><p>먼저 금화 2개 또는 카드 2장 중 1장을 고릅니다. 이어 역할 능력을 한 번 사용하거나 건너뛰고, 손패에서 건물을 건설합니다. 기본적으로 한 턴에 한 채만 건설합니다.</p></article>
        <article><h3>4. 왕관과 왕</h3><p>왕의 턴이 시작되면 왕관을 자동으로 가져옵니다. 왕관 보유자는 다음 라운드 역할 선택을 가장 먼저 시작합니다. 왕은 추가로 귀족 건물마다 금화 1개를 얻습니다.</p></article>
        <article><h3>5. 기본 역할</h3><p>암살자는 역할을 봉쇄하고, 도둑은 역할의 금화를 가져오며, 마술사는 손패를 바꿉니다. 주교·상인·왕·장군은 해당 색 건물 수입을 받습니다. 건축가는 카드 2장과 건설 3회를 얻습니다.</p></article>
        <article><h3>6. 건설과 점수</h3><p>카드 비용만큼 금화를 내고 건설합니다. 같은 일반 건물은 여러 장 가능하지만 고유 건물은 도시마다 한 장만 가능합니다. 다섯 색을 모두 갖추면 색상 완성 보너스를 얻습니다.</p></article>
        <article><h3>7. 장군과 방어</h3><p>장군은 비용보다 금화 1개 적게 내고 건물을 파괴할 수 있습니다. 성채는 파괴되지 않으며, 성벽이 있는 도시는 파괴 비용이 1개 더 듭니다.</p></article>
        <article><h3>8. 인원별 역할 선택</h3><p>2~3인은 각자 역할을 두 장 맡아 역할별로 두 번의 턴을 합니다. 2인은 두 번째 선택에서 비공개 제외 한 장과 내 역할 한 장을 함께 정하고, 3인은 첫 선택 뒤 서버가 역할 한 장을 비공개로 무작위 제외합니다.</p></article>
      </div>
      <p className="rulesHint">특수 건물의 낯선 용어는 각 카드의 <b>？ 용어 설명</b> 버튼에서 바로 확인할 수 있습니다.</p>
    </section>
  </div>;
}

function GameBoard({ room, privateState, isMyTurn, onIncome, onChooseIncome, onBuild, onDistrictAbility, onAbility, onColorIncome, onMagician, onWarlord, onScholar, onChooseScholar, onGraveyardRecover, onArtist, onSpy, onSeer, onWizard, onMagistrate, onEmperor, onSkipAction, onEnd }: {
  room: PublicRoomState;
  privateState: PrivatePlayerState | null;
  isMyTurn: boolean;
  onIncome: (type: "GOLD" | "CARDS") => void;
  onChooseIncome: (id: string) => void;
  onBuild: (id: string, card: DistrictCard) => void;
  onDistrictAbility: (payload: { type: "SMITHY" } | { type: "LABORATORY"; cardInstanceId: string }) => void;
  onAbility: (targetRoleId?: string) => void;
  onColorIncome: (color: DistrictColor) => void;
  onMagician: (payload: { type: "SWAP"; targetPlayerId: string } | { type: "REDRAW" }) => void;
  onWarlord: (payload: { targetPlayerId: string; districtInstanceId: string }) => void;
  onScholar: () => void;
  onChooseScholar: (cardInstanceId: string) => void;
  onGraveyardRecover: (recover: boolean) => void;
  onArtist: (districtInstanceId: string) => void;
  onSpy: (color: DistrictColor) => void;
  onSeer: (payload: { firstPlayerId: string; secondPlayerId: string }) => void;
  onWizard: (targetPlayerId: string) => void;
  onMagistrate: (targetPlayerId: string) => void;
  onEmperor: (targetPlayerId: string) => void;
  onSkipAction: () => void;
  onEnd: () => void;
}) {
  const [seerFirstTarget, setSeerFirstTarget] = useState<string | null>(null);
  const current = room.players.find((player) => player.id === room.game.currentPlayerId);
  const myCity = room.players.find((player) => player.id === privateState?.playerId)?.city ?? [];
  const phaseLabel = room.game.phase === GamePhase.INCOME ? "수입 선택" : room.game.phase === GamePhase.ACTION ? "역할 능력" : room.game.phase === GamePhase.BUILD ? "건설" : "턴 마무리";
  return <div className="board">
    <div className="turnBanner"><div><p className="eyebrow">{room.game.currentRoleRank}번 역할 · {phaseLabel}</p><h2>{isMyTurn ? "나의 턴입니다" : `${current?.nickname ?? "플레이어"}님의 턴`}</h2></div><strong>덱 {room.game.deckCount}장</strong></div>
    {privateState?.selectedRole && <div className="resourceBar"><span className="roleIdentity">나의 현재 역할 <b>{privateState.selectedRole.rank}번 · {privateState.selectedRole.name}</b></span><span>보유 금화 <b>🪙 {privateState.gold}</b></span></div>}
    <section className="hand city"><div className="sectionTitle"><h3>내 도시</h3><span>{myCity.length}채</span></div>{myCity.length === 0 ? <p className="emptyCity">아직 건설한 건물이 없습니다.</p> : <div className="districtGrid">{myCity.map((card) => <District key={card.instanceId} card={card} onClick={() => undefined} />)}</div>}</section>
    {privateState?.canTakeIncome && <section className="actionBox"><h3>수입을 선택하세요</h3><div className="incomeActions"><button className="primary" onClick={() => onIncome("GOLD")}>금화 2개 받기</button><button className="secondary" onClick={() => onIncome("CARDS")}>카드 2장 보기</button></div></section>}
    {privateState && privateState.incomeChoices.length > 0 && <section className="actionBox"><h3>손에 추가할 카드 {privateState.incomeSelectionsRemaining}장을 더 고르세요</h3><div className="districtGrid">{privateState.incomeChoices.map((card) => <District key={card.instanceId} card={card} action="선택" onClick={() => onChooseIncome(card.instanceId)} />)}</div></section>}
    {isMyTurn && room.game.phase === GamePhase.ACTION && privateState?.canUseAbility && privateState.selectedRole?.abilityType === "COLOR_INCOME" && myCity.some((card) => card.definitionId === "school_of_magic") && <section className="actionBox"><h3>마법 학교의 색상 수입</h3><p>이번 수입에 적용할 건물 색상을 고르세요.</p><div className="incomeActions">{(["NOBLE", "RELIGIOUS", "TRADE", "MILITARY"] as DistrictColor[]).map((color) => <button className="primary" key={color} onClick={() => onColorIncome(color)}>{color} 색 수입</button>)}</div></section>}
    {privateState?.graveyardRecoveryCard && <section className="actionBox"><h3>묘지로 파괴된 건물을 회수할까요?</h3><p>20초 안에 금화 1개를 내면 손패로 가져옵니다. 시간이 지나면 자동으로 버려집니다.</p><div className="districtGrid"><District card={privateState.graveyardRecoveryCard} onClick={() => undefined} /></div><div className="incomeActions"><button className="primary" disabled={privateState.gold < 1} onClick={() => onGraveyardRecover(true)}>금화 1개로 회수</button><button className="secondary" onClick={() => onGraveyardRecover(false)}>회수하지 않기</button></div></section>}
    {privateState?.graveyardRecoveryPending && !privateState.graveyardRecoveryCard && <section className="actionBox"><h3>묘지 회수 결정을 기다리는 중</h3><p>파괴된 도시의 소유자가 회수 여부를 결정하고 있습니다.</p></section>}
    {isMyTurn && room.game.phase === GamePhase.ACTION && !privateState?.graveyardRecoveryPending && <section className="actionBox"><h3>{privateState?.selectedRole?.abilityLabel}</h3><p>{privateState?.selectedRole?.description}</p>{privateState?.canUseAbility && privateState.selectedRole?.abilityType === "MAGICIAN" && <><div className="incomeActions"><button className="primary" onClick={() => onMagician({ type: "REDRAW" })}>내 손패 다시 뽑기</button></div><div className="roleGrid targetGrid">{room.players.filter((player) => player.id !== privateState.playerId).map((player) => <button className="roleCard" key={player.id} onClick={() => onMagician({ type: "SWAP", targetPlayerId: player.id })}><h3>{player.nickname}</h3><p>이 플레이어와 손패 교환</p></button>)}</div></>}{privateState?.canUseAbility && privateState.selectedRole?.abilityType === "WARLORD" && <div className="roleGrid targetGrid">{room.players.filter((player) => player.id !== privateState.playerId).flatMap((player) => player.city.map((district) => <button className="roleCard" key={district.instanceId} onClick={() => onWarlord({ targetPlayerId: player.id, districtInstanceId: district.instanceId })}><h3>{player.nickname} · {district.name}</h3><p>🪙 {Math.max(0, district.cost - 1) + (player.city.some((card) => card.definitionId === "great_wall") ? 1 : 0)}로 파괴</p></button>))}</div>}{privateState?.canUseAbility && privateState.selectedRole?.abilityType === "SCHOLAR_DRAW" && <button className="primary" onClick={onScholar}>설계도 5장 보기</button>}{privateState?.canUseAbility && privateState.selectedRole?.abilityType === "ARTIST" && <div className="roleGrid targetGrid">{room.players.find((player) => player.id === privateState.playerId)?.city.filter((district) => !district.decorationBonus).map((district) => <button className="roleCard" key={district.instanceId} onClick={() => onArtist(district.instanceId)}><h3>{district.name}</h3><p>가치 +2점으로 장식</p></button>)}</div>}{privateState?.canUseAbility && privateState.selectedRole?.abilityType === "SPY_COLOR" && <div className="incomeActions">{(["NOBLE", "RELIGIOUS", "TRADE", "MILITARY", "UNIQUE"] as DistrictColor[]).map((color) => <button className="primary" key={color} onClick={() => onSpy(color)}>{color} 정찰</button>)}</div>}{privateState && privateState.scholarChoices.length > 0 && <div className="districtGrid">{privateState.scholarChoices.map((card) => <District key={card.instanceId} card={card} action="연구" onClick={() => onChooseScholar(card.instanceId)} />)}</div>}{privateState?.canUseAbility && privateState.abilityTargets.length > 0 && <div className="roleGrid targetGrid">{privateState.abilityTargets.map((role) => <button className="roleCard" key={role.id} style={{ "--role-color": role.color } as React.CSSProperties} onClick={() => onAbility(role.id)}><span>{role.rank}</span><h3>{role.name}</h3><p>이 역할을 비밀리에 지정</p></button>)}</div>}<div className="incomeActions">{privateState?.canUseAbility && privateState.abilityTargets.length === 0 && !["MAGICIAN", "WARLORD", "SCHOLAR_DRAW", "ARTIST", "SPY_COLOR"].includes(privateState.selectedRole?.abilityType ?? "NONE") && <button className="primary" onClick={() => onAbility()}>능력 사용</button>}<button className="secondary" onClick={onSkipAction}>능력 사용하지 않기</button></div></section>}
    {isMyTurn && room.game.phase === GamePhase.ACTION && privateState?.selectedRole?.abilityType === "WARLORD" && privateState.canUseAbility && myCity.length > 0 && <section className="actionBox"><h3>내 도시 건물 파괴</h3><p>원작 규칙에 따라 자신의 건물도 장군 능력의 대상으로 선택할 수 있습니다.</p><div className="districtGrid">{myCity.map((district) => <District key={district.instanceId} card={district} action={`🪙 ${Math.max(0, district.cost - 1) + (myCity.some((card) => card.definitionId === "great_wall") ? 1 : 0)}로 파괴`} onClick={() => onWarlord({ targetPlayerId: privateState.playerId, districtInstanceId: district.instanceId })} />)}</div></section>}
    {isMyTurn && room.game.phase === GamePhase.ACTION && privateState?.selectedRole?.abilityType === "SEER_SWAP" && !privateState.abilityUsed && <section className="actionBox"><h3>두 플레이어의 손패 교환</h3><p>첫 번째 플레이어를 고른 뒤, 교환할 두 번째 플레이어를 선택하세요.</p><div className="roleGrid targetGrid">{room.players.filter((player) => player.id !== privateState.playerId).map((player) => <button className={`roleCard ${seerFirstTarget === player.id ? "selected" : ""}`} key={player.id} onClick={() => seerFirstTarget && seerFirstTarget !== player.id ? (onSeer({ firstPlayerId: seerFirstTarget, secondPlayerId: player.id }), setSeerFirstTarget(null)) : setSeerFirstTarget(seerFirstTarget === player.id ? null : player.id)}><h3>{player.nickname}</h3><p>{seerFirstTarget && seerFirstTarget !== player.id ? "이 플레이어와 손패 교환" : "첫 번째 플레이어 선택"}</p></button>)}</div></section>}
    {isMyTurn && room.game.phase === GamePhase.ACTION && privateState?.selectedRole?.abilityType === "WIZARD_BORROW" && !privateState.abilityUsed && <section className="actionBox"><h3>다른 손패에서 설계도 1장 가져오기</h3><div className="roleGrid targetGrid">{room.players.filter((player) => player.id !== privateState.playerId && player.handCount > 0).map((player) => <button className="roleCard" key={player.id} onClick={() => onWizard(player.id)}><h3>{player.nickname}</h3><p>무작위 설계도 1장 가져오기</p></button>)}</div></section>}
    {isMyTurn && room.game.phase === GamePhase.ACTION && privateState?.selectedRole?.abilityType === "MAGISTRATE_THREAT" && !privateState.abilityUsed && <section className="actionBox"><h3>위협 표식 배치</h3><div className="roleGrid targetGrid">{room.players.filter((player) => player.id !== privateState.playerId).map((player) => <button className="roleCard" key={player.id} onClick={() => onMagistrate(player.id)}><h3>{player.nickname}</h3><p>다음 건설에 추가 금화 1개</p></button>)}</div></section>}
    {isMyTurn && room.game.phase === GamePhase.ACTION && privateState?.selectedRole?.abilityType === "EMPEROR_CROWN" && !privateState.abilityUsed && <section className="actionBox"><h3>왕관을 넘길 플레이어 선택</h3><p>현재 왕관 보유자에게서 금화 1개 또는 무작위 설계도 1장을 받습니다.</p><div className="roleGrid targetGrid">{room.players.filter((player) => player.id !== privateState.playerId).map((player) => <button className="roleCard" key={player.id} onClick={() => onEmperor(player.id)}><h3>{player.nickname}</h3><p>{player.hasCrown ? "현재 왕관 보유자" : "새 왕관 보유자로 지정"}</p></button>)}</div></section>}
    {privateState?.canUseDistrictAbility && myCity.some((card) => card.definitionId === "smithy" || card.definitionId === "laboratory") && <section className="actionBox"><h3>효과 건물 사용</h3><div className="incomeActions">{myCity.some((card) => card.definitionId === "smithy") && <button className="primary" disabled={privateState.gold < 2} onClick={() => onDistrictAbility({ type: "SMITHY" })}>대장간: 금화 2개로 카드 3장</button>}</div>{myCity.some((card) => card.definitionId === "laboratory") && <div className="districtGrid">{privateState.hand.map((card) => <District key={card.instanceId} card={card} action="연구소에서 버리고 금화 1개" onClick={() => onDistrictAbility({ type: "LABORATORY", cardInstanceId: card.instanceId })} />)}</div>}</section>}
    <section className="hand"><div className="sectionTitle"><h3>내 손패</h3><span>{privateState?.canBuild ? `건설 가능 ${privateState.buildsRemaining}회 · ` : ""}{privateState?.hand.length ?? 0}장</span></div><div className="districtGrid">{privateState?.hand.map((card) => <District key={card.instanceId} card={card} action={privateState.canBuild && privateState.gold >= card.cost ? "건설" : undefined} onClick={() => onBuild(card.instanceId, card)} />)}</div></section>
    {isMyTurn && [GamePhase.BUILD, GamePhase.TURN_END].includes(room.game.phase) && <div className="turnActions"><button className="primary" onClick={onEnd}>{room.game.phase === GamePhase.BUILD ? "건설하지 않고 턴 종료" : "턴 종료"}</button></div>}
  </div>;
}

function District({ card, action, onClick }: { card: DistrictCard; action?: string; onClick: () => void }) {
  const [showGlossary, setShowGlossary] = useState(false);
  const glossary = CARD_GLOSSARY[card.definitionId];
  return <article className={`district color-${card.color.toLowerCase()}`}>
    <div className="cardHeader"><span>{DISTRICT_COLOR_LABEL[card.color]} 건물</span><b>🪙 {card.cost}</b></div>
    <CardArtwork src={DISTRICT_ART[card.definitionId]} alt={`${card.name} 건물 일러스트`} />
    <h3>{card.name}</h3>
    <p>{card.description}</p>
    <div className="cardFooter"><span>{card.unique ? "고유 건물" : "기본 점수"}</span><b>{card.cost}점</b></div>
    {glossary && <><button className="glossaryToggle" aria-expanded={showGlossary} onClick={() => setShowGlossary((visible) => !visible)}>？ 용어 설명</button>{showGlossary && <div className="glossary" role="note">{glossary.map((item) => <p key={item.term}><b>{item.term}</b>{item.description}</p>)}</div>}</>}
    {card.decorationBonus && <small>✨ 장식 가치 +{card.decorationBonus}</small>}
    {action && <button className="primary" onClick={onClick}>{action}</button>}
  </article>;
}

function RoleFace({ role, description = role.description }: { role: RoleDefinition; description?: string }) {
  return <>
    <div className="cardHeader"><span className="roleRank">{role.rank}번</span><b>역할 카드</b></div>
    <CardArtwork src={ROLE_ART[role.id]} alt={`${role.name} 역할 일러스트`} />
    <h3>{role.name}</h3>
    <p>{description}</p>
    <div className="cardFooter"><span>{role.abilityLabel}</span><b>{role.incomeColor ? `${DISTRICT_COLOR_LABEL[role.incomeColor]} 수입` : "특수 능력"}</b></div>
  </>;
}

function CardArtwork({ src, alt }: { src?: string; alt: string }) {
  return src ? <img className="cardArtwork" src={src} alt={alt} loading="lazy" /> : <div className="cardArtwork cardArtworkPlaceholder" aria-hidden="true" />;
}

function WonderConstruction({ card }: { card: DistrictCard }) {
  return <div className="wonderOverlay" role="status" aria-live="polite">
    <div className="wonderRays" />
    <div className="wonderDust wonderDustOne" /><div className="wonderDust wonderDustTwo" /><div className="wonderDust wonderDustThree" />
    <div className="wonderStage"><p>고유 건물 완성</p><div className="wonderCard"><span>✦</span><h2>{card.name}</h2><small>도시에 새로운 역사가 세워졌습니다</small></div></div>
  </div>;
}

function GameEnd({ room, meId, canRematch, onRematch }: { room: PublicRoomState; meId: string; canRematch: boolean; onRematch: () => void }) {
  const winner = room.game.finalScores[0];
  return <section className="gameEnd">
    <div className="bigIcon">♛</div>
    <p className="eyebrow">최종 결과</p>
    <h2>{winner?.playerId === meId ? "당신이 도시의 승자가 되었습니다" : `${winner?.nickname ?? "승자"}님의 승리`}</h2>
    <div className="scoreTable">{room.game.finalScores.map((score, index) => <div className={`scoreRow ${score.playerId === meId ? "me" : ""}`} key={score.playerId}>
      <strong>{index + 1}</strong><span>{score.nickname}{score.playerId === meId && " (나)"}</span>
      <small>건물 {score.districtPoints} + 장식 {score.decorationPoints} + 특수 {score.specialDistrictPoints} + 색상 {score.colorBonus} + 완성 {score.completionBonus}</small><b>{score.total}점</b>
    </div>)}</div>
    {canRematch ? <button className="primary" onClick={onRematch}>같은 멤버로 재대결</button> : <p>방장이 재대결을 시작하면 다시 준비할 수 있습니다.</p>}
  </section>;
}

function Status({ connected, message }: { connected: boolean; message: string }) {
  return <div className="status" role="status"><span className={`dot ${connected ? "online" : ""}`} />{connected ? "서버 연결됨" : "재연결 중"}{message && <b>{message}</b>}</div>;
}

function finish<T>(result: ActionResult<T>, success?: (data: T) => void) {
  if (result.ok && result.data !== undefined) success?.(result.data);
}

function readSession(): SessionData | null {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as SessionData | null; }
  catch { return null; }
}
