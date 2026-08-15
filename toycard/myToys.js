/*
 * ================= 我的 Toys 配置 =================
 * 在此追加你自己的 Toy 项目，抽卡时会一并加入抽取池（本地加载 / 线上加载都生效）。
 *
 * 字段说明：
 *   id       - 唯一数字标识（建议用大数字，避免与线上 id 冲突）
 *   poster   - 图标文件名，放在 images/ 目录下（如 'mygame.png'）；也支持 http(s) 完整图片地址
 *   title    - 项目名字
 *   author   - UP主名字
 *   category - 类型（游戏 / 工具 / 测试 / 互动叙事，或自定义类型）
 *   pv_text  - 游玩次数展示文案（如 '1.2w'）
 *   slug     - 跳转所用项目名，跳转地址为 https://www.bilibili.com/toy/{slug}
 *   store_tag- 展示标签（可选，如 '镇店之宝'；为空则不显示，处理同线上数据）
 *   count    - 抽取频率（可选，默认 1：正常；2：概率翻倍，依此类推；同批抽卡不重复）
 *
 * 用法：把 poster 对应的图标文件放进 images/ 目录，然后照下面的格式加一条即可。
 */
window.MY_TOYS = [
  {
    id: 1,
    poster: 'chess.jpg',
    title: '五子棋·与智能AI对战',
    author: '炫光超佛帝',
    category: '游戏',
    pv_text: '114.514w',
    slug: 'chess',
	store_tag: '潜力佳作',
	count: 10,
  },
];
