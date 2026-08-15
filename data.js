// ================================================================
// TOYS 数据字典（列表存储，方便调换顺序）
// 图片均从 ./image/ 读取，url 请改为真实的游戏主页链接
// rec 为推荐语（可留空），非空时会在游戏名称后显示【rec】
// ================================================================

// ---- TOYS·小游戏 ----
const toysGames = [
	{ name: '五子棋-AI对战', rec: '力荐', image: './image/chess.jpg', url: './chess/index.html' },
	{ name: '无尽魔塔', rec: '', image: './image/tower.jpg', url: './tower/index.html' },
	{ name: '飞机大战', rec: '', image: './image/plane.jpg', url: './plane/index.html' },
	{ name: '逃离托儿所', rec: '', image: './image/nusery.jpg', url: './nusery/index.html' },
	{ name: '元素方块', rec: '', image: './image/box.jpg', url: './box/index.html' },

	{ name: '中国人能飞', rec: '上新', image: './image/fly.jpg', url: './fly/index.html' },
	{ name: 'Flappy 菲比啾比', rec: '上新', image: './image/flappy.jpg', url: './flappy/index.html' },
	{ name: '合成大肥鱼', rec: '上新', image: './image/deepseek.jpg', url: './deepseek/index.html' },
	{ name: '模拟射箭', rec: '上新', image: './image/shoot.jpg', url: './shoot/index.html' },
	{ name: '捕鱼达人', rec: '上新', image: './image/catch.jpg', url: './catch/index.html' },

	{ name: '大鱼吃小鱼', rec: '', image: './image/fish.jpg', url: './fish/index.html' },
	{ name: '恐龙快跑', rec: '', image: './image/google.jpg', url: './google/index.html' },
	{ name: '一掷千金', rec: '', image: './image/deal.jpg', url: './deal/index.html' },
	{ name: '赛博木鱼', rec: '', image: './image/cyber.jpg', url: './cyber/index.html' },
	{ name: '财富帝国', rec: '', image: './image/money.jpg', url: './money/index.html' },

	{ name: '生命游戏', rec: '', image: './image/game.jpg', url: './game/index.html' },
	{ name: '贪吃可莉蛇', rec: '', image: './image/genshin.jpg', url: './snake/index.html' },
	{ name: '扫雷', rec: '', image: './image/mine.jpg', url: './mine/index.html' },
	{ name: '2048', rec: '', image: './image/2048.jpg', url: './2048/index.html' },
	{ name: '24点', rec: '', image: './image/24.jpg', url: './24/index.html' },

	{ name: '打鸟', rec: '', image: './image/bird.jpg', url: './bird/index.html' },
];

// ---- TOYS·测试工具 ----
const toysTools = [
	{ name: '在线阅读器', rec: '作品试读', image: './image/reader.jpg', url: './reader/index.html' },
	{ name: 'TOYSTORE抽卡版', rec: '力荐', image: './image/toys.jpg', url: './toycard/index.html' },
	{ name: '寻找爱播', rec: '', image: './image/gal.jpg', url: './gal/index.html' },
	{ name: '原神VS鸣潮', rec: '', image: './image/vote.jpg', url: './vote/index.html' },
	{ name: '优质网文书单', rec: '', image: './image/book.jpg', url: './book/index.html' },

	{ name: '工作性价比评估问卷', rec: '上新', image: './image/work.jpg', url: './work/index.html' },
	{ name: '旋转画板', rec: '上新', image: './image/circle.jpg', url: './paint/index.html' },
	{ name: 'FIRE计算器', rec: '', image: './image/fire.jpg', url: './fire/index.html' },
	{ name: '手速测试', rec: '', image: './image/test.jpg', url: './test/index.html' },
	{ name: '手速测试2', rec: '', image: './image/time.jpg', url: './time/index.html' },

	{ name: '电子万花筒', rec: '', image: './image/mirror.jpg', url: './mirror/index.html' },
];

// ========== 继续添加 ==========
// 小游戏：toysGames.push({ name: '新游戏', rec: '', image: './image/xxx.jpg', url: 'https://...' });
// 测试工具：toysTools.push({ name: '新工具', rec: '', image: './image/xxx.jpg', url: 'https://...' });
