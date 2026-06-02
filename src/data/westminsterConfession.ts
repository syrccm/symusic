// 웨스트민스터 신앙고백서 (Westminster Confession of Faith) — 전 33장
// 한국어 번역본. 본문 데이터는 웹 공개본 기준으로 채워집니다.

export interface ConfessionSection {
  number: number;
  text: string;
  references: string[];
}

export interface ConfessionChapter {
  chapter: number;
  title: string;
  sections: ConfessionSection[];
}

export const confession: ConfessionChapter[] = [
  {
    chapter: 1,
    title: '성경에 대하여',
    sections: [
      {
        number: 1,
        text: '본성의 빛과 창조와 섭리의 사역들은 하나님의 선하심과 지혜와 능력을 너무도 분명하게 나타내므로 사람들은 변명할 수 없습니다. 그러나 그것들은 구원에 이르는 데 필요한 하나님과 그의 뜻에 관한 지식을 주기에는 충분하지 못합니다. 그러므로 주께서는 여러 시대에 여러 방법으로 자신을 계시하시고 자기 교회에 그의 뜻을 선포하시기를 기뻐하셨으며, 그 후에는 그 진리를 더 잘 보존하고 전파하며 육신의 부패와 사탄과 세상의 악의에 대항하여 교회를 더 확실하게 세우고 위로하시기 위하여 그 진리를 온전히 기록되게 하시기를 기뻐하셨습니다. 그러므로 성경은 가장 필요한 것입니다. 이는 하나님께서 자기 백성에게 자신의 뜻을 계시하시던 이전의 방법들이 이제는 그쳤기 때문입니다.',
        references: ['롬 2:14-15', '롬 1:19-20', '시 19:1-3', '딤후 3:15-17', '히 1:1-2'],
      },
    ],
  },
];
