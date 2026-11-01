// Kullanım rehberinin bütün metni. Sayfa (GuidePage) ve indirilebilir kontrol listesi buradan beslenir.
// Bir şey değişirse (sınırlar, menü adları) yalnızca burayı güncellemek yeter.

export type GuideLang = 'tr' | 'en'

/** `to` uygulama içi rota ("/settings") ya da sayfa içi çapa ("#files") olabilir. */
export interface GuideLink { to: string; label: string }
export interface GuideStep { title?: string; text: string; link?: GuideLink }
export interface GuideRow { term: string; text: string; link?: GuideLink }

/** Rehber resimlerinin kimlikleri. Her biri src/guide/illustrations.tsx içinde çizilir. */
export type ArtId =
  | 'appFolder' | 'address' | 'devmode' | 'loadUnpacked' | 'pickFolder'
  | 'card' | 'pin' | 'reload' | 'popup' | 'connected'
  | 'appJobs' | 'postDetail' | 'popupJobs' | 'useProfile' | 'useLikes' | 'comments' | 'toolOff'
  | 'updateTab' | 'updateManual'

/** Eklentinin üç ayrı işi (Gönderileri çek, Beğenenleri çek, Yorumları çek). Pencerede her birinin kendi kartı var. */
export type ToolId = 'posts' | 'likers' | 'comments'
export const TOOL_IDS: ToolId[] = ['posts', 'likers', 'comments']
/** Kullanım bölümündeki iş bloklarının çapaları (/guide#begenenler gibi). */
export const TOOL_ANCHOR: Record<ToolId, string> = { posts: 'gonderi-listesi', likers: 'begenenler', comments: 'yorumlar' }

/** Eklenti penceresindeki bir araç kartının yazıları (popup.html ile aynı). `action` kartın iş düğmesi. */
export interface PopupToolLabels { title: string; desc: string; stat: string; action: string }

/** Kullanım bölümünde bir iş: ne yaptığı ve Instagram sekmesinde ne olduğunu gösteren resimli adımları. */
export interface UseTool {
  id: ToolId
  title: string
  what: string
  steps: InstallStep[]
  tip?: { title: string; text: string }
}

/** Resimli adım (kurulum ve kullanım). `alt` ekran okuyucu için resmin tarifi, `caption` resmin altındaki kısa yazı. */
export interface InstallStep {
  art: ArtId
  title: string
  text: string
  tip?: string
  /** Yanına "Kopyala" düğmesi konacak metin (ör. chrome://extensions). */
  copy?: string
  link?: GuideLink
  alt: string
  caption: string
}

/** Resimlerin içinde görünen yazılar: Chrome'un ve uygulamanın düğme adları. */
export interface ArtLabels {
  /** Uygulamanın kurulduğu klasörün adı ve içindeki kurulum dosyası. */
  appFolder: string
  installerFile: string
  appFolderHint: string
  rightFolder: string
  appTab: string
  downloads: string
  desktop: string
  documents: string
  typeHere: string
  newTab: string
  enterKey: string
  extensionsTitle: string
  searchExtensions: string
  devMode: string
  loadUnpacked: string
  packExtension: string
  update: string
  pickTitle: string
  select: string
  cancel: string
  folderContents: string
  extName: string
  extVersion: string
  details: string
  remove: string
  errors: string
  errorsHint: string
  manageExtensions: string
  reloadOr: string
  reloadWin: string
  reloadMac: string
  /** Eklenti penceresinin üst çubuğu: logonun yanında ad ve "Köprü vX". */
  popupBrand: string
  popupBridge: string
  popupTabTools: string
  popupTabSettings: string
  popupTabUpdate: string
  popupLead: string
  popupTools: Record<ToolId, PopupToolLabels>
  /** Araçlar sekmesinde kartların üstündeki iş çubuğu: çalışan işin yazısı ve "Durdur". */
  popupJobText: string
  popupJobStop: string
  popupStatus: string
  /** Ana anahtar kapalıyken durum kutusundaki yazı. */
  popupOff: string
  popupToday: string
  popupTodayValue: string
  popupLast: string
  popupLastValue: string
  popupProfile: string
  popupProfileValue: string
  popupChange: string
  popupAppUrl: string
  popupAppUrlValue: string
  popupOpenApp: string
  popupInstalled: string
  popupAppVersion: string
  popupVersionValue: string
  popupNewVersionValue: string
  popupLastCheck: string
  popupLastCheckValue: string
  popupUpToDate: string
  popupManual: string
  popupManualNote: string
  popupCheckNow: string
  settingsHeading: string
  bridgeTitle: string
  bridgeConnected: string
  bridgeDesc: string
  bridgeFound: string
  bridgeProgress: string
  igHandle: string
  igStats: string
  igLikes: string
  igLikersTitle: string
  igMoreComments: string
  scrollToEnd: string
  scrollList: string
  clickHere: string
  warnBanner: string
  warnBannerTodo: string
  /** Uygulamanın Gönderiler sayfası: başlık, üç iş düğmesi, iş kutusu ve gönderi ayrıntı paneli. */
  appPostsTitle: string
  appRun: Record<ToolId, string>
  appJobMsg: string
  appStop: string
  appJobNote: string
  appOpenIg: string
  appRunLikersOne: string
  appRunCommentsOne: string
  appLikesTab: string
  appCommentsTab: string
}

export interface WarningCallout {
  title: string
  intro: string
  signs: string[]
  effectsTitle: string
  effects: string[]
  doTitle: string
  do: string[]
  never: string
  alt: string
  caption: string
}

export type SectionId = 'start' | 'zip' | 'bridge' | 'use' | 'results' | 'safety' | 'faq' | 'files'
export const SECTION_ORDER: SectionId[] = ['start', 'zip', 'bridge', 'use', 'results', 'safety', 'faq', 'files']

/**
 * Sayfa içi çapa adları. Diğer sayfalar /guide#kopru, /guide#uyari ve /guide#referans adreslerine bağlanıyor;
 * değiştirme. Ayrıca #kullanim (bu tablodan) ve #guncelle (eklentiyi güncelleme adımları) var.
 */
export const SECTION_ANCHOR: Record<SectionId, string> = {
  start: 'baslarken', zip: 'zip', bridge: 'kopru', use: 'kullanim', results: 'sonuclar', safety: 'guvenlik', faq: 'sss', files: 'referans',
}
export const UPDATE_ANCHOR = 'guncelle'

export interface GuideContent {
  title: string
  subtitle: string
  tocLabel: string
  sections: Record<SectionId, string>
  start: { intro: string; steps: GuideStep[] }
  zip: {
    intro: string
    pathLabel: string
    path: string[]
    /** `path` içinde vurgulanacak (yanlış seçilirse sonuç bozulan) adımlar. */
    pathKey: string[]
    requestTitle: string
    request: GuideStep[]
    warningTitle: string
    warning: string
    uploadTitle: string
    upload: GuideStep[]
    filesTitle: string
    fileCol: string
    descCol: string
    files: GuideRow[]
    noLikes: string
  }
  bridge: {
    intro: string
    howTitle: string
    how: string
    rulesTitle: string
    rules: string[]
    warning: WarningCallout
    installTitle: string
    installIntro: string
    install: InstallStep[]
    ui: ArtLabels
    copy: { button: string; done: string; failed: string }
    stepLabel: string
    /** Kurulum adımlarının altındaki tek satır: klasöre ulaşamayan için zip yolu (kendiliğinden güncellenmez). */
    zipNote: { text: string; link: GuideLink }
    troubleTitle: string
    troubleIntro: string
    trouble: GuideRow[]
    update: {
      title: string
      intro: string
      steps: GuideStep[]
      tip: string
      alt: string
      caption: string
      /** Zip kopyasından kurulmuş eklenti için bir kerelik düzeltme. */
      fixTitle: string
      fixIntro: string
      fixSteps: GuideStep[]
      fixAlt: string
      fixCaption: string
    }
  }
  use: {
    intro: string
    /** İşi nereden başlatırsın: uygulamanın Gönderiler sayfası, tek gönderi paneli, eklenti penceresi. */
    stepsTitle: string
    stepsIntro: string
    steps: InstallStep[]
    /** "Durdur" ve sekmeyi kapatmak. */
    stop: { title: string; text: string }
    /** Üç iş, her biri ayrı bir blok. */
    toolsTitle: string
    toolsIntro: string
    toolLabel: string
    tools: UseTool[]
    /** Kendin gezerken de kaydeder (iş başlatmadan). */
    passive: { title: string; text: string }
    /** Araç anahtarları ve ana anahtar. */
    off: { title: string; text: string; alt: string; caption: string }
    troubleTitle: string
    trouble: GuideRow[]
    afterTitle: string
    after: string
    limitTitle: string
    limit: string
  }
  results: {
    intro: string
    pagesTitle: string
    pages: GuideRow[]
    groupsTitle: string
    groupsNote: string
    groups: GuideRow[]
    decideTitle: string
    decide: string[]
  }
  safety: {
    intro: string
    topicCol: string
    ruleCol: string
    rows: GuideRow[]
    riskTitle: string
    risk: string
    limitsTitle: string
    limits: string[]
  }
  faq: { intro: string; qCol: string; aCol: string; items: GuideRow[] }
  files: {
    intro: string
    ext: { title: string; text: string; button: string; building: string; unavailable: string; error: string; count: string }
    samples: { title: string; text: string; tryIt: string; button: string }
    checklist: { title: string; text: string; button: string }
  }
  checklistDoc: {
    fileName: string
    title: string
    intro: string
    groups: { title: string; items: string[] }[]
    footer: string
  }
}

/**
 * Eklenti penceresinin yazıları. Pencere yalnızca Türkçe; resimler gerçeğiyle aynı kalsın diye iki dilde de bu
 * kullanılır. frontend/extension/popup.html ve popup.js değişirse burayı da güncelle.
 */
const POPUP = {
  popupBrand: 'InstaAnalytic',
  popupBridge: 'Köprü',
  popupTabTools: 'Araçlar',
  popupTabSettings: 'Ayarlar',
  popupTabUpdate: 'Güncelleme',
  popupLead: "Instagram'a kendisi istek göndermez. Siz gezerken ya da aşağıdaki düğmelerle başlattığınız işlerde sayfanın indirdiği bilgiyi kaydeder. Her iş ayrı çalışır.",
  popupTools: {
    posts: {
      title: 'Gönderi listesi',
      desc: 'Gönderilerinizi tarih, beğeni ve yorum sayısıyla kaydeder. Düğme profilinizi açıp sonuna kadar kaydırır.',
      stat: '50 gönderi bulundu',
      action: 'Gönderileri çek',
    },
    likers: {
      title: 'Beğenenler',
      desc: 'Gönderilerinizi kimin beğendiğini kaydeder. Düğme okunmamış gönderileri sırayla açar, beğenenler listesini sonuna kadar kaydırır.',
      stat: '12 / 50 gönderi okundu',
      action: 'Beğenenleri çek',
    },
    comments: {
      title: 'Yorumlar',
      desc: 'Kimin yorum yaptığını kaydeder. Düğme yorumu olan gönderileri sırayla açar, tüm yorumları yükler.',
      stat: '9 gönderinin yorumları kaydedildi',
      action: 'Yorumları çek',
    },
  },
  popupJobText: 'Beğenenler: 3 / 12',
  popupJobStop: 'Durdur',
  popupStatus: 'Dinliyor.',
  popupOff: 'Köprü kapalı. Sağ üstteki anahtarla açın.',
  popupToday: 'Bugün',
  popupTodayValue: '3 gönderi, 214 kişi',
  popupLast: 'Son kayıt',
  popupLastValue: '14:32',
  popupProfile: 'Profil',
  popupProfileValue: '@gktuoktay',
  popupChange: 'Değiştir',
  popupAppUrl: 'Uygulama adresi',
  popupAppUrlValue: 'http://localhost:3002',
  popupOpenApp: 'Uygulamayı aç',
  popupInstalled: 'Yüklü sürüm',
  popupAppVersion: 'Uygulamadaki sürüm',
  popupVersionValue: '2.4.0',
  popupNewVersionValue: '2.5.0',
  popupLastCheck: 'Son denetim',
  popupLastCheckValue: '14:30',
  popupUpToDate: 'Güncel',
  popupManual: 'Yeni sürüm var, elle kurulum gerekiyor',
  popupManualNote: 'Yeni sürüm var (2.5.0). Bu kopya kendiliğinden güncellenemiyor.',
  popupCheckNow: 'Şimdi denetle',
} satisfies Partial<ArtLabels>

const tr: GuideContent = {
  title: 'Kullanım rehberi',
  subtitle: 'İlk kez kuruyorsan buradan başla. Her bölüm birkaç dakikada okunur.',
  tocLabel: 'Bu sayfada',
  sections: {
    start: 'Başlarken',
    zip: 'Verini ekle (ZIP)',
    bridge: 'Köprü eklentisini kur',
    use: 'Eklentiyi kullan',
    results: 'Sonuçları okumak',
    safety: 'Güvenlik ve sınırlar',
    faq: 'Sık sorulanlar',
    files: 'Referans dosyalar',
  },

  start: {
    intro: 'Dört adımda ilk sonuçları görürsün. Instagram şifren hiçbir adımda istenmez.',
    steps: [
      {
        title: 'Profilini ekle',
        text: 'Kurulum sihirbazını aç ve Instagram kullanıcı adını yaz. Sadece kullanıcı adı yeterli.',
        link: { to: '/start', label: 'Kurulum sihirbazı' },
      },
      {
        title: 'Takipçi listeni yükle',
        text: "Instagram'dan istediğin ZIP dosyasını Ayarlar sayfasına bırak. Nasıl isteneceği bir sonraki bölümde.",
        link: { to: '#zip', label: 'ZIP nasıl istenir' },
      },
      {
        title: 'Beğenenleri ve yorumları kaydet (isteğe bağlı)',
        text: "ZIP kimin beğendiğini ve yorum yaptığını içermez. Bunun için Tarayıcı köprüsü eklentisini Chrome'a kur. Eklentinin üç ayrı işi var: Gönderileri çek, Beğenenleri çek ve Yorumları çek. Bir düğmeye basınca eklenti bir Instagram sekmesi açar ve işi orada yapar.",
        link: { to: '#kullanim', label: 'Nasıl kaydedilir' },
      },
      {
        title: 'Sonuçlara bak',
        text: 'Takipçi Analizi, ZIP yüklendiği anda hazırdır. Gözden çıkar ve Takipçi Skoru için en az 10 gönderinin beğenenleri okunmuş olmalı.',
        link: { to: '/followers', label: 'Takipçi Analizi' },
      },
    ],
  },

  zip: {
    intro: "En güvenli yol, Instagram'ın kendi \"Bilgilerini indir\" özelliği. Bu yolda uygulama Instagram'a tek bir istek bile göndermez.",
    pathLabel: 'Kısa yol',
    path: ['Hesaplar Merkezi', 'Bilgilerini indir', 'Bilgilerinin bir kısmı', 'Takipçiler ve takip edilenler', 'Tüm zamanlar', 'JSON'],
    pathKey: ['Tüm zamanlar', 'JSON'],
    requestTitle: "Instagram'dan ZIP isteme",
    request: [
      { text: "Instagram'da Profil → sağ üstteki menü (☰) → Hesaplar Merkezi'ni aç. Bilgisayardan: Ayarlar → Hesaplar Merkezi." },
      { text: '"Bilgilerin ve izinlerin" → "Bilgilerini indir" → "Bilgileri indir veya aktar"ı seç.' },
      { text: 'Hesabını seç, sonra "Bilgilerinin bir kısmı"na dokun.' },
      { text: 'Listeden yalnızca "Takipçiler ve takip edilenler"i işaretle. Başka bir şey seçme, dosya küçük kalsın.' },
      { text: '"Cihaza indir"i seç. Tarih aralığı: "Tüm zamanlar". Biçim: JSON. Sonra talebi gönder.' },
      { text: 'Dosya hazır olunca Instagram e-posta ya da bildirim gönderir. Bu birkaç dakika da sürebilir, birkaç saat de. İndirme bağlantısı birkaç gün sonra geçersiz olur.' },
    ],
    warningTitle: 'Tarih aralığını mutlaka "Tüm zamanlar" yap',
    warning: 'Başka bir aralık seçilirse listeler eksik gelir. Örneğin 858 takipçin varken dosyada yalnızca 94 kişi çıkar. Bütün sonuçlar da buna göre yanlış olur.',
    uploadTitle: 'Uygulamaya yükleme',
    upload: [
      { text: 'Ayarlar sayfasında profilini seç ve ZIP dosyasını Veri bölümüne bırak.', link: { to: '/settings', label: 'Ayarlar' } },
      { text: "ZIP'i açmana gerek yok. Büyük dosyalar da sorun değil: dosya tarayıcında açılır, yalnızca iki liste gönderilir. Fotoğraf, video ve mesajların bilgisayarından çıkmaz." },
      { text: "İstersen ZIP yerine içindeki followers_1.json ve following.json dosyalarını tek tek de seçebilirsin." },
      { text: 'Her yeni yüklemede kimin geldiği, kimin ayrıldığı da gösterilir. Haftada bir yüklemek yeterli.' },
    ],
    filesTitle: "ZIP'in içinde neye bakılır",
    fileCol: 'Dosya',
    descCol: 'Ne işe yarar',
    files: [
      { term: 'followers_1.json', text: 'Seni takip edenler. Büyük hesaplarda followers_2.json, followers_3.json diye devam eder; hepsi okunur.' },
      { term: 'following.json', text: 'Senin takip ettiklerin.' },
      { term: 'threads/ klasörü', text: 'Threads uygulamasının listeleri. Instagram listesiyle karışmasın diye bilerek atlanır.' },
    ],
    noLikes: "ZIP'te beğeni ve yorum bilgisi hiç yok; Instagram bunu dışa aktarmıyor. Kimin etkileşim kurduğunu görmek için bir sonraki bölümdeki eklentiyi kullan.",
  },

  bridge: {
    intro: 'Tarayıcı köprüsü bir Chrome eklentisi. Kendi gönderilerini kimin beğendiğini ve kimin yorum yaptığını kaydeder.',
    howTitle: 'Nasıl çalışır',
    how: "Eklenti Instagram'a kendi isteğini göndermez. Instagram'ın kendi sayfasını bir insan gibi kullanır: kaydırır, tıklar. Sayfa listeyi kendisi indirir, eklenti de inen bilgiyi okur. Üç ayrı işi var. Gönderileri çek: profilini yeni bir sekmede açar ve sonuna kadar kaydırır. Beğenenleri çek: beğenenleri okunmamış gönderilerini sırayla açar, beğenme sayısına tıklar ve listeyi sonuna kadar kaydırır. Yorumları çek: yorumu olan gönderilerini açar ve bütün yorumlar yüklenene kadar \"daha fazla yorum\"a basar. Hepsi bilgisayarındaki uygulamaya gider.",
    rulesTitle: 'Bu ne anlama geliyor',
    rules: [
      'Zamanlayıcı ya da günlük sınır yok. Bir iş yalnızca sen bir düğmeye bastığında başlar.',
      'İş görünen bir Instagram sekmesinde çalışır. Ne yaptığını izleyebilirsin. Sekmeyi kapatırsan iş durur.',
      'Aynı anda tek iş çalışır. Gönderiler arasında 6–18 saniye arası rastgele bekler.',
      "Eklenti hiçbir adrese kendisi istek göndermediği için, Instagram adreslerini değiştirse de çalışmaya devam eder.",
      'Yalnızca kendi gönderilerinin beğenenleri ve yorumları kaydedilir. Sayfanın yüklediği başka her şeyi uygulama yok sayar.',
      "Veriler yalnızca bilgisayarında durur. InstaAnalytic sunucusu Instagram'a hiç bağlanmaz.",
      'Eklenti takip etmez, beğenmez, yorum yazmaz, mesaj atmaz. Yalnızca kaydırır ve listeleri açar.',
      'Instagram bir uyarı gösterirse eklenti bunu fark eder ve seni uyarır. Hiçbir şeyi durdurmaz; karar senin. Ne yapman gerektiği hemen aşağıda.',
    ],
    warning: {
      title: 'Instagram bir uyarı gösterirse',
      intro: 'Bu kısmı mutlaka oku. Instagram şunlardan birini gösterebilir. Eklenti bunu sayfanın aldığı yanıtlardan fark eder:',
      signs: [
        '"Çok fazla istek" hatası (429)',
        '"Daha sonra tekrar dene" uyarısı',
        '"Bunun sen olduğunu doğrula" gibi bir doğrulama ekranı',
        "Instagram'ın seni giriş sayfasına atması",
      ],
      effectsTitle: 'Ne olur',
      effects: [
        'Uygulamada her sayfanın üstünde kırmızı bir şerit çıkar. Şerit, hangi tarihe kadar ara vermeni önerdiğimizi yazar.',
        'Eklenti simgesinin üstünde kırmızı bir "!" belirir. Eklenti penceresinde de kırmızı bir uyarı kutusu çıkar.',
        'Bu bir uyarı, engel değil. Hiçbir iş kendiliğinden kesilmez, hiçbir düğme kilitlenmez. Devam edip etmemek senin kararın.',
      ],
      doTitle: 'Önerimiz',
      do: [
        'Ara ver: en az 24 saat. Bir hafta içinde yine olursa 72 saat.',
        "Instagram'ı telefonundan her zamanki gibi kullan.",
        'Instagram bir doğrulama isterse onu kendin tamamla.',
        'Devam edersen daha yavaş git: bir seferde daha az gönderi, aralarda daha uzun mola.',
      ],
      never: 'Uyarıyı aşmaya çalışma. Eklentiyi silip yeniden kurma, başka bir tarayıcı, hesap ya da bilgisayar deneme. Bunlar hesabını daha büyük riske sokar.',
      alt: 'Uyarı sonrası görünüm: uygulamanın üstünde kırmızı bir şerit var; şeritte hangi tarihe kadar ara vermenin önerildiği ve hiçbir şeyin durdurulmadığı yazıyor. Araç çubuğundaki eklenti simgesinde kırmızı bir ünlem işareti duruyor.',
      caption: 'Kırmızı şerit ve simgedeki "!": önerimiz bir süre ara vermen.',
    },
    installTitle: 'Kurulum, adım adım (yaklaşık 5 dakika)',
    installIntro: 'Her adımda neye tıklayacağın resimde renkli bir çerçeve ve numarayla gösteriliyor. Resimler Chrome\'un sadeleştirilmiş hâli; seninki biraz farklı görünebilir. Eklentiyi uygulamanın kendi klasöründen yüklüyorsun. Bu yüzden kurulum yalnızca bir kez yapılır; uygulama güncellenince eklenti de kendiliğinden güncellenir.',
    install: [
      {
        art: 'appFolder',
        title: 'InstaAnalytic klasörünü bul',
        text: 'Uygulamayı kurduğun klasörü aç. İçinde "InstaAnalytic Kur.command" (Windows\'ta "InstaAnalytic Kur.bat") dosyası olan klasör bu. Önce frontend klasörüne, sonra onun içindeki extension klasörüne gir: InstaAnalytic → frontend → extension. manifest.json dosyasını görüyorsan doğru yerdesin.',
        tip: 'Bu klasörü silme ve taşıma. Chrome eklentiyi buradan çalıştırır. Klasörün yerini hatırlamıyorsan Finder\'da (Windows\'ta Dosya Gezgini\'nde) "InstaAnalytic Kur" diye ara.',
        alt: 'InstaAnalytic klasörü sütunlar hâlinde açık. İlk sütunda, "InstaAnalytic Kur.command" dosyasıyla aynı yerdeki frontend klasörü işaretli. İkinci sütunda extension klasörü işaretli. Üçüncü sütunda manifest.json dosyası ve "doğru klasör" yazısı görünüyor.',
        caption: 'InstaAnalytic → frontend → extension.',
      },
      {
        art: 'address',
        title: 'Uzantılar sayfasını aç',
        text: "Chrome'da yeni bir sekme aç. Üstteki adres çubuğuna chrome://extensions yaz ve Enter'a bas.",
        tip: 'Bu adres bağlantı gibi tıklanmaz, Chrome buna izin vermez. Elle yaz ya da aşağıdaki düğmeyle kopyalayıp adres çubuğuna yapıştır.',
        copy: 'chrome://extensions',
        alt: 'Chrome adres çubuğuna chrome://extensions yazılmış. Yanında Enter tuşu gösteriliyor.',
        caption: "Adres çubuğuna yaz, Enter'a bas.",
      },
      {
        art: 'devmode',
        title: 'Geliştirici modunu aç',
        text: 'Uzantılar sayfasının sağ üst köşesinde "Geliştirici modu" anahtarı var. Ona bir kez tıkla, anahtar renklenir.',
        tip: 'Bu anahtar, bilgisayarındaki bir klasörden eklenti yüklemeyi açar. Başka bir şeyi değiştirmez.',
        alt: 'Chrome Uzantılar sayfası. Sağ üstteki "Geliştirici modu" anahtarı açık ve işaretli.',
        caption: '"Geliştirici modu" açık olmalı.',
      },
      {
        art: 'loadUnpacked',
        title: '"Paketlenmemiş öğe yükle"ye tıkla',
        text: 'Anahtarı açınca sol üstte yeni düğmeler çıkar. İlki "Paketlenmemiş öğe yükle". Ona tıkla, bir klasör seçme penceresi açılır.',
        alt: 'Uzantılar sayfasının sol üstünde üç düğme. İlki olan "Paketlenmemiş öğe yükle" işaretli.',
        caption: 'Soldaki ilk düğme.',
      },
      {
        art: 'pickFolder',
        title: 'extension klasörünü seç',
        text: 'Açılan pencerede InstaAnalytic klasörüne git ve frontend klasörünü aç. İçindeki extension klasörüne bir kez tıkla, sonra "Seç"e bas. Seçtiğin klasör: InstaAnalytic/frontend/extension.',
        tip: 'InstaAnalytic ya da frontend klasörünü seçme. Doğru klasörün içinde manifest.json adında bir dosya vardır.',
        alt: 'Klasör seçme penceresi, InstaAnalytic › frontend açık. extension klasörü seçili ve işaretli; altında içinde manifest.json olduğu yazıyor. Sağ alttaki "Seç" düğmesi işaretli.',
        caption: 'frontend içindeki extension klasörünü seç.',
      },
      {
        art: 'card',
        title: 'Eklentinin listede olduğunu gör',
        text: 'Listede "InstaAnalytic Köprüsü" adında bir kart belirir. Solunda uygulamanın logosu, altında sürüm numarası yazar (ör. 2.4.0). Kartın sağ altındaki anahtar açık olmalı.',
        tip: 'Kartta kırmızı bir "Hatalar" düğmesi görürsen bir şey ters gitmiş demektir. Aşağıdaki "Kurulum çalışmadıysa" listesine bak.',
        alt: 'Uzantılar sayfasında InstaAnalytic Köprüsü 2.4.0 kartı işaretli; solunda uygulamanın logosu var. Yanında, kırmızı "Hatalar" düğmesinin bir sorun anlamına geldiği gösteriliyor.',
        caption: 'Kart göründüyse eklenti yüklendi.',
      },
      {
        art: 'pin',
        title: 'Eklentiyi araç çubuğuna sabitle',
        text: "Adres çubuğunun sağındaki yapboz parçası simgesine (Uzantılar) tıkla. Açılan listede InstaAnalytic Köprüsü'nün yanındaki raptiyeye bas. Eklentinin simgesi artık hep görünür. Simge uygulamanın logosu: turuncu bir kare içinde yükselen üç beyaz çubuk.",
        alt: 'Chrome araç çubuğundaki yapboz parçası simgesi işaretli. Açılan Uzantılar listesinde, InstaAnalytic logosunun yanındaki InstaAnalytic Köprüsü satırında raptiye simgesi işaretli.',
        caption: 'Önce yapboz parçası, sonra raptiye.',
      },
      {
        art: 'reload',
        title: 'Instagram sekmesini yenile',
        text: 'Instagram zaten bir sekmede açıksa o sekmeyi bir kez yenile. Kurulumdan önce açılmış bir Instagram sekmesinde eklenti çalışmaz. Açık değilse instagram.com\'u aç ve giriş yap.',
        tip: "Yenilemek için adres çubuğunun solundaki yuvarlak oka bas. Ya da klavyede F5'e bas, Mac'te Cmd+R.",
        alt: 'Instagram sekmesi açık bir Chrome penceresi. Adres çubuğunun solundaki yenile simgesi işaretli. Altında F5 ve Cmd+R tuşları gösteriliyor.',
        caption: 'Sekmeyi bir kez yenile.',
      },
      {
        art: 'popup',
        title: 'Eklentiyi aç ve köprüyü başlat',
        text: 'Eklenti simgesine tıkla, sağ üstteki anahtarı aç; Ayarlar sekmesinden profilini kontrol et. Pencerenin üstünde Araçlar, Ayarlar ve Güncelleme sekmeleri var. Ayarlar sekmesindeki Profil satırında kendi profilin yazmalı. Yazmıyorsa "Değiştir"e bas ve seç.',
        tip: 'Araçlar sekmesindeki üç kartın her birinde bir iş düğmesi var: Gönderileri çek, Beğenenleri çek ve Yorumları çek. Nasıl kullanılacakları bir sonraki bölümde.',
        alt: 'Eklenti penceresi, Araçlar sekmesi açık. Araç çubuğundaki eklenti simgesi, pencerenin sağ üstündeki anahtar ve Ayarlar sekmesi sırayla işaretli. Altta Gönderi listesi, Beğenenler ve Yorumlar kartları duruyor; kartlarda Gönderileri çek, Beğenenleri çek ve Yorumları çek düğmeleri var. Durum kutusunda yeşil nokta ve "Dinliyor." yazıyor.',
        caption: 'Simge, sağ üstteki anahtar, sonra Ayarlar sekmesinde profil.',
      },
      {
        art: 'connected',
        title: 'Bağlandığını kontrol et',
        text: 'Uygulamada Ayarlar ya da Gözden çıkar sayfasını aç. "Tarayıcı köprüsü" kartında yeşil bir nokta ve "Dinliyor" yazısını görürsen kurulum tamamdır.',
        tip: 'Görmezsen Instagram sekmesini bir kez yenile, sonra uygulama sayfasını da yenile. Uygulama sayfası eklentiyle doğrudan konuşur; eklentiyi kurduktan ya da güncelledikten sonra uygulama sayfasını bir kez yenilemen gerekir.',
        link: { to: '/settings', label: 'Ayarlar' },
        alt: 'Uygulamanın Ayarlar sayfasında Tarayıcı köprüsü kartı. Yeşil nokta ve "Dinliyor" yazısı işaretli.',
        caption: 'Yeşil nokta: eklenti dinliyor.',
      },
    ],
    ui: {
      appFolder: 'InstaAnalytic',
      installerFile: 'InstaAnalytic Kur.command',
      appFolderHint: 'Kur dosyasının olduğu klasör',
      rightFolder: 'doğru klasör',
      appTab: 'InstaAnalytic',
      downloads: 'İndirilenler',
      desktop: 'Masaüstü',
      documents: 'Belgeler',
      typeHere: 'Buraya yaz',
      newTab: 'Yeni sekme',
      enterKey: 'Enter ↵',
      extensionsTitle: 'Uzantılar',
      searchExtensions: 'Uzantılarda ara',
      devMode: 'Geliştirici modu',
      loadUnpacked: 'Paketlenmemiş öğe yükle',
      packExtension: 'Uzantıyı paketle',
      update: 'Güncelle',
      pickTitle: 'Klasör seç',
      select: 'Seç',
      cancel: 'İptal',
      folderContents: 'içinde: manifest.json, popup.html…',
      extName: 'InstaAnalytic Köprüsü',
      extVersion: '2.4.0',
      details: 'Ayrıntılar',
      remove: 'Kaldır',
      errors: 'Hatalar',
      errorsHint: 'Bu düğme çıkarsa sorun var',
      manageExtensions: 'Uzantıları yönet',
      reloadOr: 'ya da',
      reloadWin: 'Windows',
      reloadMac: 'Mac',
      ...POPUP,
      settingsHeading: 'Ayarlar',
      bridgeTitle: 'Tarayıcı köprüsü',
      bridgeConnected: 'Dinliyor',
      bridgeDesc: 'Instagram\'da açtığın beğenen listelerini kaydeder.',
      bridgeFound: '50 gönderi bulundu',
      bridgeProgress: '12 / 50 gönderi okundu',
      igHandle: 'gktuoktay',
      igStats: '50 gönderi · 858 takipçi · 412 takip',
      igLikes: '214 beğenme',
      igLikersTitle: 'Beğenmeler',
      igMoreComments: 'Daha fazla yorum yükle',
      scrollToEnd: 'Sona kadar kaydırır',
      scrollList: 'Sona kadar kaydırır',
      clickHere: 'tıkla',
      warnBanner: 'Instagram @gktuoktay için uyarı verdi. 3.11.2026 14:30 tarihine kadar ara vermeni öneririz.',
      warnBannerTodo: 'Hiçbir şey durdurulmadı; devam edip etmemek senin kararın.',
      appPostsTitle: 'Gönderi Analizi',
      appRun: { posts: 'Gönderileri çek', likers: 'Beğenenleri çek', comments: 'Yorumları çek' },
      appJobMsg: 'Beğenenler: 3 / 12',
      appStop: 'Durdur',
      appJobNote: 'Eklenti Instagram sekmesinde çalışıyor; iş bitince sekmeyi kendisi kapatır. Sekmeyi kapatırsan iş durur.',
      appOpenIg: "Instagram'da aç",
      appRunLikersOne: 'Bu gönderinin beğenenlerini çek',
      appRunCommentsOne: 'Bu gönderinin yorumlarını çek',
      appLikesTab: 'Likelar (214)',
      appCommentsTab: 'Yorumlar (9)',
    },
    copy: { button: 'Kopyala', done: 'Kopyalandı', failed: 'Kopyalanamadı. Elle yaz.' },
    stepLabel: 'Adım',
    zipNote: {
      text: 'Klasöre ulaşamıyorsan eklentiyi zip olarak da indirebilirsin. Ama bu kopya kendiliğinden güncellenmez; yeni sürüm çıkınca bir kez kaldırıp uygulama klasöründen yüklemen gerekir.',
      link: { to: '#referans', label: 'Zip olarak indir' },
    },
    troubleTitle: 'Kurulum çalışmadıysa',
    troubleIntro: 'En sık karşılaşılan durumlar ve çözümleri:',
    trouble: [
      { term: '"Paketlenmemiş öğe yükle" düğmesi yok.', text: 'Geliştirici modu kapalı. Uzantılar sayfasında sağ üstteki anahtarı aç.' },
      {
        term: '"Manifest dosyası eksik veya okunamıyor" hatası',
        text: 'Yanlış klasör seçildi. InstaAnalytic ya da frontend klasörünü değil, onun içindeki extension klasörünü seç. Doğru klasörün içinde manifest.json vardır.',
      },
      { term: 'Eklenti "Instagram sekmesini bir kez yenileyin" diyor.', text: "Instagram sekmesi eklentiden önce açılmış. Sekmeyi bir kez yenile (F5, Mac'te Cmd+R)." },
      { term: 'Eklenti penceresi "Uygulama kapalı" diyor.', text: 'InstaAnalytic şu an çalışmıyor. Uygulamayı başlat. Eklenti birkaç dakika içinde kendiliğinden bağlanır.' },
      { term: 'Eklenti kartında kırmızı "Hatalar" düğmesi var.', text: 'Düğmeye bas ve mesajı oku. Çoğu zaman yanlış klasör seçilmiştir. Eklentiyi "Kaldır" ile sil ve doğru klasörle yeniden yükle.' },
      { term: 'Eklenti simgesi araç çubuğunda yok.', text: "Yapboz parçası simgesine tıkla ve InstaAnalytic Köprüsü'nün yanındaki raptiyeye bas." },
      {
        term: 'Kart hâlâ "Eklenti henüz bağlanmadı" diyor.',
        text: 'Eklenti penceresinde sağ üstteki anahtar açık mı, profil seçili mi? Instagram sekmesini bir kez yenile, sonra uygulama sayfasını da yenile.',
      },
      {
        term: 'Kartta "Eklentin güncel değil" yazıyor.',
        text: 'Eklenti birkaç saat içinde kendini günceller. Beklemek istemezsen eklenti penceresinde Güncelleme sekmesini aç ve "Şimdi denetle"ye bas. Orada "elle kurulum gerekiyor" yazıyorsa bir alttaki satıra bak.',
        link: { to: '#guncelle', label: 'Güncelleme' },
      },
      {
        term: 'Eklenti "elle kurulum gerekiyor" diyor.',
        text: 'Eklentiyi indirilmiş bir zip kopyasından kurmuşsun. Bu kopya kendiliğinden güncellenemez. Bunu bir kez yap: chrome://extensions sayfasında eskisini kaldır, sonra "Paketlenmemiş öğe yükle" ile InstaAnalytic/frontend/extension klasörünü seç. Sonraki güncellemeler kendiliğinden gelir.',
        link: { to: '#guncelle', label: 'Adım adım' },
      },
      {
        term: 'Eklenti "güncellendi" dedi ama kayıt olmuyor.',
        text: "Açık Instagram sekmesi hâlâ eski sürümle çalışıyor. Sekmeyi bir kez yenile (F5, Mac'te Cmd+R).",
      },
    ],
    update: {
      title: 'Eklentiyi güncellemek',
      intro: 'Normalde yapman gereken bir şey yok. Eklenti uygulamanın klasöründen yüklendiği için uygulamayla birlikte güncellenir.',
      steps: [
        { text: 'Uygulama güncellenince eklentinin dosyaları da güncellenir. Dosya indirmen ya da kopyalaman gerekmez.' },
        { text: 'Eklenti birkaç saatte bir uygulamada yeni sürüm var mı diye bakar. Penceresini açtığında ve bir Instagram sayfası yüklendiğinde de bakar.' },
        { text: 'Yeni sürüm varsa eklenti kendini yeniden yükler ve "Eklenti X sürümüne güncellendi. Açık Instagram sekmesini bir kez yenileyin." der.' },
        { text: 'Açık Instagram sekmesini ve uygulama sayfasını bir kez yenile. Bu kadar.' },
      ],
      tip: 'Hemen bakmak istersen eklenti penceresinde Güncelleme sekmesini aç ve "Şimdi denetle"ye bas. İki sürüm aynıysa "Güncel" yazar.',
      alt: 'Eklenti penceresi, Güncelleme sekmesi açık. Yüklü sürüm 2.4.0, Uygulamadaki sürüm 2.4.0; durum satırında yeşil nokta ve "Güncel" yazıyor. Güncelleme sekmesi ve "Şimdi denetle" düğmesi sırayla işaretli.',
      caption: 'Güncelleme sekmesi: sürümler aynıysa "Güncel".',
      fixTitle: 'Eklentiyi zip dosyasından kurduysan (bir kez yapılır)',
      fixIntro: 'İndirilmiş bir zip kopyası kendiliğinden güncellenemez. Yeni sürüm çıkınca eklenti bunu fark eder: simgesinde turuncu bir "↑" belirir, Güncelleme sekmesinde "Yeni sürüm var (X). Bu kopya kendiliğinden güncellenemiyor." yazar. Uygulamadaki Tarayıcı köprüsü kartında da "Eklentin güncel değil" yazar. Şunu bir kez yap, sonraki güncellemeler kendiliğinden gelir:',
      fixSteps: [
        { text: 'chrome://extensions sayfasını aç. "InstaAnalytic Köprüsü" kartında "Kaldır"a bas. Kaydettiğin beğenenler uygulamada kalır, silinmez. Instagram uyarısı sürüyorsa bunu uyarı geçtikten sonra yap.' },
        { text: '"Paketlenmemiş öğe yükle"ye bas ve InstaAnalytic/frontend/extension klasörünü seç (içinde manifest.json olan).', link: { to: '#kurulum-1', label: 'Kurulum adımları' } },
        { text: 'Eklenti penceresini aç. Sağ üstteki anahtarı aç, Ayarlar sekmesinde profilini kontrol et.' },
        { text: 'Açık Instagram sekmesini bir kez yenile. İndirdiğin eski klasörü artık silebilirsin.' },
      ],
      fixAlt: 'Eklenti penceresi, Güncelleme sekmesi açık. Araç çubuğundaki eklenti simgesinde turuncu bir "↑" var. Pencerenin durum satırında turuncu nokta ve "Yeni sürüm var, elle kurulum gerekiyor" yazıyor; altında "Bu kopya kendiliğinden güncellenemiyor." notu var. Simge ve durum satırı sırayla işaretli.',
      fixCaption: 'Turuncu "↑": bu kopya bir kez uygulama klasöründen yeniden yüklenmeli.',
    },
  },

  use: {
    intro: "Eklentinin üç ayrı işi var: Gönderileri çek, Beğenenleri çek ve Yorumları çek. Bir işi başlatınca eklenti yeni bir Instagram sekmesi açar ve işi orada, senin görebileceğin şekilde yapar: kaydırır, tıklar. Instagram'a kendi isteğini göndermez. İş bitince sekmeyi kendisi kapatır.",
    stepsTitle: 'İşi nereden başlatırsın',
    stepsIntro: 'Üç yer var. Hangisinden başlatırsan başlat iş aynıdır. Aynı anda tek iş çalışır.',
    steps: [
      {
        art: 'appJobs',
        title: 'Uygulamada: Gönderiler sayfası',
        text: 'Uygulamada Gönderiler sayfasını aç. Başlığın sağında üç düğme var: "Gönderileri çek", "Beğenenleri çek" ve "Yorumları çek". Birine bas. Altında bir iş kutusu çıkar: işin yazısı (ör. "Beğenenler: 3 / 12"), bir ilerleme çubuğu ve "Durdur" düğmesi. Liste, kayıt geldikçe kendiliğinden tazelenir.',
        tip: 'Düğmeler soluksa ve "Bu işler tarayıcı köprüsü eklentisiyle yapılır; eklenti bu sayfada bulunamadı" yazıyorsa eklenti kurulu değil ya da bu sayfa eklentiden önce açılmış. Eklentiyi kur ya da güncelle, sonra sayfayı bir kez yenile.',
        link: { to: '/posts', label: 'Gönderiler' },
        alt: 'Uygulamanın Gönderiler sayfası. Başlığın sağındaki Gönderileri çek, Beğenenleri çek ve Yorumları çek düğmeleri işaretli. Altındaki iş kutusunda "Beğenenler: 3 / 12" yazısı ve ilerleme çubuğu, sağında "Durdur" düğmesi sırayla işaretli.',
        caption: 'Üç düğme; altında çalışan işin kutusu.',
      },
      {
        art: 'postDetail',
        title: 'Tek bir gönderi için',
        text: 'Gönderiler sayfasında bir gönderiye tıkla. Açılan panelin üstünde iki düğme var: "Bu gönderinin beğenenlerini çek" ve "Bu gönderinin yorumlarını çek". Eklenti yalnızca o gönderiyi açar. Bir gönderiye sonradan beğeni geldiyse ya da bir listede eksik varsa bunu kullan.',
        tip: 'Yorumu olmayan bir gönderide yorum düğmesi soluk görünür.',
        alt: 'Gönderiler sayfasında açılmış gönderi paneli. Üst satırda beğeni ve yorum sayısı ile "Instagram\'da aç" bağlantısı var. Sağdaki "Bu gönderinin beğenenlerini çek" ve "Bu gönderinin yorumlarını çek" düğmeleri sırayla işaretli.',
        caption: 'Panelde yalnızca bu gönderi için iki düğme.',
      },
      {
        art: 'popupJobs',
        title: 'Eklenti penceresinden',
        text: 'Araç çubuğundaki eklenti simgesine tıkla. Araçlar sekmesindeki her kartın kendi iş düğmesi var: "Gönderileri çek", "Beğenenleri çek" ve "Yorumları çek". Bir iş çalışırken kartların üstünde bir iş çubuğu çıkar: dönen bir işaret, işin yazısı ve "Durdur". O sırada düğmeler soluk görünür.',
        tip: 'İş düğmeleri kartların anahtarlarından bağımsız çalışır. Anahtarlar yalnızca kendin gezerken kaydetmeyi açıp kapatır.',
        alt: 'Eklenti penceresi, Araçlar sekmesi. Kartların üstündeki iş çubuğunda dönen bir işaret, "Beğenenler: 3 / 12" yazısı ve "Durdur" düğmesi var. Gönderileri çek, Beğenenleri çek ve Yorumları çek düğmeleri ile iş çubuğu sırayla işaretli.',
        caption: 'Her kartta bir iş düğmesi; üstte çalışan iş.',
      },
    ],
    stop: {
      title: 'Durdurmak',
      text: 'İşi durdurmak için uygulamadaki iş kutusunda ya da eklenti penceresindeki iş çubuğunda "Durdur"a bas. Instagram sekmesini kapatmak da işi durdurur. O ana kadar okunanlar kayıtlı kalır. Devam etmek için işi yeniden başlat; okunmuş gönderiler atlanır.',
    },
    toolsTitle: 'Üç iş, ne yapar',
    toolsIntro: 'Sırayla git: önce gönderiler, sonra beğenenler, sonra yorumlar. Beğenenler ve yorumlar gönderi listesine dayanır.',
    toolLabel: 'İş',
    tools: [
      {
        id: 'posts',
        title: 'Gönderileri çek',
        what: 'Gönderilerini tarih, beğeni ve yorum sayısıyla kaydeder. Diğer iki iş bu listeye dayanır, o yüzden önce bunu yap. Yeni bir gönderi paylaşınca tekrarla.',
        steps: [
          {
            art: 'useProfile',
            title: 'Profilini açar, sonuna kadar kaydırır',
            text: 'Eklenti profilini yeni bir Instagram sekmesinde açar ve gönderilerinin sonuna gelene kadar yavaşça aşağı kaydırır. Bitince sekmeyi kapatır. Kartta "N gönderi bulundu" yazar.',
            alt: 'Instagram profil sayfası, gönderi kutucukları görünüyor. Sağda aşağı doğru bir ok ve "Sona kadar kaydırır" yazısı işaretli. Altında eklentinin Gönderi listesi kartında "50 gönderi bulundu" yazısı işaretli.',
            caption: 'Eklenti kaydırır: "50 gönderi bulundu".',
          },
        ],
      },
      {
        id: 'likers',
        title: 'Beğenenleri çek',
        what: 'Gönderilerini kimin beğendiğini kaydeder. Beğenenleri henüz okunmamış gönderilerini sırayla açar, bir seferde en çok 50 gönderi.',
        steps: [
          {
            art: 'useLikes',
            title: 'Beğenme sayısına tıklar, listeyi kaydırır',
            text: 'Eklenti gönderiyi açar, fotoğrafın altındaki "X beğenme" yazısına tıklar ve açılan listeyi sonuna kadar kaydırır. Sonra 6–18 saniye bekleyip aynı sekmede sıradaki gönderiye geçer. Kartta çubuk dolar, okunan gönderi sayısı artar. Hepsi bitince düğmede "Hepsi okundu" yazar.',
            alt: 'Açık bir Instagram gönderisi. Fotoğrafın altındaki "214 beğenme" yazısı işaretli. Yanında açılan Beğenmeler listesi ve altındaki "Sona kadar kaydırır" yazısı işaretli.',
            caption: 'Eklenti "214 beğenme"ye tıklar, listeyi sonuna kadar kaydırır.',
          },
        ],
        tip: { title: 'Acele etme', text: 'Bir seferde 5–10 gönderi yeter. Sonra "Durdur"a bas, gerisini birkaç güne yay. Hesabın yeniyse ya da daha önce uyarı aldıysan bu daha da önemli.' },
      },
      {
        id: 'comments',
        title: 'Yorumları çek',
        what: 'Gönderilerine kimin yorum yaptığını kaydeder. Yalnızca yorumu olan gönderileri açar.',
        steps: [
          {
            art: 'comments',
            title: 'Bütün yorumları yükler',
            text: 'Eklenti gönderiyi açar ve bütün yorumlar yüklenene kadar "daha fazla yorum" düğmesine basar. Yorum yapanlar kaydedilir. Sonra sıradaki gönderiye geçer.',
            alt: 'Açık bir Instagram gönderisi. Sağdaki yorumlar ve altındaki "Daha fazla yorum yükle" düğmesi sırayla işaretli. Yanında eklentinin Yorumlar kartında "9 gönderinin yorumları kaydedildi" yazısı işaretli.',
            caption: 'Eklenti "daha fazla yorum"a basar; yorum yapanlar kaydedilir.',
          },
        ],
      },
    ],
    passive: {
      title: 'Kendin gezerken de kaydeder',
      text: "İş başlatmadan da olur. Instagram'da kendi profilini kaydırdığında, bir gönderinin beğenenler listesini açtığında ya da bir gönderini açtığında eklenti sayfanın indirdiği bilgiyi kaydeder. Bunun için sağ üstteki anahtar ve o aracın kendi anahtarı açık olmalı.",
    },
    off: {
      title: 'Anahtarlar',
      text: 'Her kartın kendi küçük anahtarı var. Anahtar yalnızca kendin gezerken kaydetmeyi açıp kapatır: kapalı araç gezerken hiçbir şey kaydetmez. İş düğmeleri anahtarlardan bağımsız çalışır. Sağ üstteki büyük anahtar, gezerken kaydetmeyi hepsi için birden kapatır. O zaman durum kutusunda "Köprü kapalı. Sağ üstteki anahtarla açın." yazar.',
      alt: 'Eklenti penceresi, Araçlar sekmesi. Yorumlar kartı kapalı ve soluk; kartın küçük anahtarı işaretli. Sağ üstteki büyük anahtar ikinci olarak işaretli.',
      caption: 'Kapalı araç soluk görünür; gezerken hiçbir şey kaydetmez.',
    },
    troubleTitle: 'Bir şey ters giderse',
    trouble: [
      {
        term: 'Düğmeler soluk, "eklenti bu sayfada bulunamadı" yazıyor.',
        text: 'Uygulama sayfası eklentiyi bulamadı. Eklentiyi kur ya da 2.4.0 sürümüne güncelle, sonra uygulama sayfasını bir kez yenile. Eklenti uygulama sayfasına küçük bir betik ekler; bu betik ancak sayfa yenilenince yüklenir.',
        link: { to: '#kopru', label: 'Kurulum' },
      },
      { term: '"Eklenti yanıt vermedi" yazıyor.', text: 'Uygulama sayfasını yenileyip tekrar dene. Eklenti az önce güncellendiyse sayfa eski bağlantıyla kalmış olabilir.' },
      {
        term: "\"Önce Instagram'ı bir sekmede açıp eklentide profilinizi seçin\" yazıyor.",
        text: "Eklenti hangi profil için çalışacağını henüz bilmiyor. Instagram'ı bir sekmede aç, sonra eklenti penceresinde Ayarlar sekmesinden profilini seç.",
      },
      { term: '"Zaten çalışan bir iş var" yazıyor.', text: 'Aynı anda tek iş çalışır. Çalışanın bitmesini bekle ya da "Durdur"a bas.' },
      {
        term: 'İş başladı ama beğenenler gelmedi.',
        text: 'Gönderide beğeni sayısı gizli olabilir ya da liste açılmamıştır. O gönderide "Bu gönderinin beğenenlerini çek"i dene. Olmazsa gönderiyi kendin aç, beğenme sayısına tıkla ve listeyi sonuna kadar kaydır.',
      },
      { term: 'Sekmeyi kapattım.', text: 'İş durdu. O ana kadar okunanlar kayıtlı. İşi yeniden başlat; okunmuş gönderiler atlanır.' },
      {
        term: 'Kartta "Henüz gönderi yok" ya da "Önce gönderi listesi gerekli" yazıyor.',
        text: 'Önce "Gönderileri çek". Beğenenler ve yorumlar gönderi listesine dayanır.',
      },
      {
        term: 'Beğenenler düğmesinde "Hepsi okundu" yazıyor.',
        text: 'Bütün gönderilerin beğenenleri okunmuş. Yeni bir gönderi paylaştıysan önce "Gönderileri çek". Tek bir gönderinin listesini tazelemek için gönderi panelindeki "Bu gönderinin beğenenlerini çek"i kullan.',
      },
      {
        term: "Kartta \"Instagram'da @… açık\" yazıyor.",
        text: "Chrome'da başka bir Instagram hesabı açık. O hesapla hiçbir şey kaydedilmez. Instagram'da bu profilin hesabına geç ya da eklenti penceresinden doğru profili seç.",
      },
      { term: 'Başkasının gönderisini açtım, kaydedilmedi.', text: 'Bilerek böyle. Yalnızca kendi gönderilerinin beğenenleri ve yorumları kaydedilir.' },
    ],
    afterTitle: 'Sonrası',
    after: 'Kaç gönderinin okunduğunu eklenti penceresindeki Beğenenler kartında görürsün. Uygulamada da köprü kartında ve Gönderiler sayfasında yazar. Yeni bir gönderi paylaştığında önce "Gönderileri çek", sonra "Beğenenleri çek". Bir gönderiye sonradan beğeni geldiyse gönderi panelindeki "Bu gönderinin beğenenlerini çek" ile yalnızca onu yeniden oku.',
    limitTitle: 'Açık konuşalım',
    limit: "İş görünen bir Instagram sekmesinde çalışır ve sayfayı bir insan gibi kullanır: kaydırır, tıklar. Instagram'a kendi isteğini göndermez. Yine de Instagram uyarı gösterebilir; hiçbir araç sıfır risk garanti edemez. Uyarı gelirse uygulama seni uyarır ama seni durdurmaz. Devam edip etmemek senin kararın.",
  },

  results: {
    intro: 'Her sayfa farklı bir soruya cevap verir.',
    pagesTitle: 'Sayfalar',
    pages: [
      {
        term: 'Takipçi Analizi',
        text: 'Üç liste: seni geri takip etmeyenler, karşılıklı takipleştiklerin ve hayaletler. Hayalet, silinmiş ya da dondurulmuş hesap demek. Bunlar oturum açılmamış, çerezsiz bir tarayıcıyla tek tek kontrol edilir; senin hesabın bu kontrole hiç karışmaz.',
        link: { to: '/followers', label: 'Aç' },
      },
      {
        term: 'Gönderiler',
        text: 'Gönderilerin ve hangilerinin beğenen listesinin okunduğu. Gönderileri çek, Beğenenleri çek ve Yorumları çek düğmeleri de burada.',
        link: { to: '/posts', label: 'Aç' },
      },
      {
        term: 'Etkileşim Raporu',
        text: 'Gönderi başına ortalama beğeni ve yorum, en çok etkileşim aldığın gün ve saatler.',
        link: { to: '/report', label: 'Aç' },
      },
      {
        term: 'Takipçi Skoru',
        text: 'Her takipçiye 0–100 arası bir puan. Son gönderilerinde ne kadar beğeni ve yorum bıraktığına göre hesaplanır. Isınan ve soğuyan takipçileri de gösterir.',
        link: { to: '/fans', label: 'Aç' },
      },
      {
        term: 'Gözden çıkar',
        text: 'Takip ettiklerini ve takipçilerini etkileşime göre gruplara ayırır. Gruplar aşağıda.',
        link: { to: '/cleanup', label: 'Aç' },
      },
      {
        term: 'Kuyruk monitörü',
        text: 'Sırada bekleyen ve çalışan işler. Bir işin neden beklediğini burada görürsün.',
        link: { to: '/monitor', label: 'Aç' },
      },
      {
        term: 'Aksiyon geçmişi',
        text: 'Uygulamanın yaptığı her takip ve takipten çıkma işlemi, tarihiyle.',
        link: { to: '/actions', label: 'Aç' },
      },
    ],
    groupsTitle: 'Gözden çıkar grupları',
    groupsNote: 'Bu sayfa, beğenenleri okunan son gönderilerde kimin beğeni ya da yorum bıraktığına bakar. Sonucun doğru olması için en az 10 gönderinin beğenenleri okunmuş ve takipçi listesi eksiksiz olmalı (ZIP\'te "Tüm zamanlar").',
    groups: [
      { term: 'Hayaletler', text: 'Silinmiş ya da dondurulmuş hesaplar. Takip etmenin bir anlamı kalmamış. Bırakması en kolay grup.' },
      { term: 'Sen takip ediyorsun, o etmiyor, hiç etkileşimi yok', text: 'Seni geri takip etmiyor ve okunan gönderilerinde hiç beğeni ya da yorumu yok. Takipten çıkma adaylarının çoğu burada.' },
      { term: 'Karşılıklı ama sessiz', text: 'Birbirinizi takip ediyorsunuz ama gönderilerine hiç dokunmamış. Çoğu zaman gerçek bir tanıdık; acele etme.' },
      { term: 'Sessiz takipçi', text: 'Seni takip ediyor ama etkileşim kurmuyor. Genelde bir şey yapmana gerek yok.' },
      { term: 'Sadık', text: 'Düzenli beğenen ve yorum yapanlar. En değerli takipçilerin.' },
    ],
    decideTitle: 'Kimi bırakacağına nasıl karar verirsin',
    decide: [
      'Hayaletlerle başla. Onlar için düşünmeye gerek yok.',
      'Listeyi bir kez kendi gözünle gözden geçir. Ailen, arkadaşların ya da iş bağlantıların etkileşim kurmasa da önemli olabilir.',
      'Ünlüler, markalar ve haber hesapları seni zaten geri takip etmez. İçerikleri için takip ediyorsan listede durmaları normal.',
      'Yeni gönderilerin etkileşimi henüz eksik olabilir. Kararı en az 10 gönderinin beğenenleri okunduktan sonra ver.',
      "Takipten çıkmayı Instagram'dan elle ve günde birkaç düzineyi geçmeden yapmak en güvenlisi. Uygulamanın kendi takip/çıkış işlemleri varsayılan olarak kapalıdır.",
    ],
  },

  safety: {
    intro: "Uygulamanın temel kuralı, Instagram'ın spam korumasını hiç tetiklememek. Şunlar her zaman geçerli:",
    topicCol: 'Konu',
    ruleCol: 'Kural',
    rows: [
      { term: 'Şifre', text: 'Hiçbir yerde istenmez, saklanmaz.' },
      { term: 'ZIP ile veri', text: "Instagram'a hiç istek gitmez." },
      { term: 'Beğenen ve yorum kaydetme', text: "Eklenti Instagram'a kendi isteğini göndermez. Görünen bir Instagram sekmesinde sayfayı bir insan gibi kullanır (kaydırır, tıklar) ve sayfanın indirdiği listeyi okur. Sunucu Instagram'a bağlanmaz." },
      { term: 'Ne zaman kaydeder', text: 'Yalnızca sen bir iş başlattığında ya da kendin gezerken. Zamanlayıcı ve günlük sınır yok. Aynı anda tek iş çalışır; gönderiler arasında 6–18 saniye rastgele bekler.' },
      { term: 'Ne kaydedilmez', text: 'Başkalarının gönderileri, kapattığın araçların verisi ve sayfanın yüklediği başka her şey. Uygulama bunları yok sayar.' },
      { term: 'Hayalet kontrolü', text: 'Oturumsuz, çerezsiz bir tarayıcıyla yapılır. Hesabınla bağlantısı yok.' },
      {
        term: 'Uyarı gelirse',
        text: 'Uygulamada kırmızı bir şerit, eklenti simgesinde kırmızı "!" çıkar. Bu bir uyarı, engel değil; hiçbir şey kendiliğinden kesilmez. Önerimiz en az 24 saat (bir hafta içinde tekrarlarsa 72 saat) ara vermen.',
        link: { to: '#uyari', label: 'Ne yapmalı' },
      },
      { term: 'Takip / takipten çıkma', text: 'Varsayılan olarak kapalı. Açılsa bile saatte en fazla 15, günde en fazla 60 işlem; iki işlem arasında en az 60 saniye. Bu işlemlerin birinde Instagram engel gösterirse uygulama kendi takip işlemlerini 6 saat bekletir.' },
      { term: 'Verilerin', text: 'Yalnızca kendi bilgisayarında durur. Ayarlar sayfasındaki "Tüm verimi sil" ile hepsini silebilirsin.', link: { to: '/settings', label: 'Ayarlar' } },
    ],
    riskTitle: 'Risk profili neyi değiştirir',
    risk: "Ayarlar'da üç profil var: Güvenli, Dengeli, Agresif. Profil, uygulamanın kendi yaptığı takip ve takipten çıkma işlemlerinin beklemelerini ve sınırlarını belirler. Köprüyü etkilemez; köprünün işleri gönderiler arasında her zaman 6–18 saniye bekler. Çoğu kişi için Güvenli yeterli. Agresif'te uyarı alma ihtimali belirgin şekilde artar.",
    limitsTitle: 'Bilinen sınırlar',
    limits: [
      'Instagram eşiklerini açıklamaz. Buradaki sayılar tahmindir.',
      'Hiçbir ayar "hesabım kısıtlanmaz" garantisi vermez. Ayarlar sadece riski düşürür.',
      'Eklenti Instagram adreslerine bağlı değil. Ama sayfanın indirdiği verinin biçimi çok değişirse listeyi tanıyamayabilir; o zaman eklentinin yeni bir sürümü gerekir. Uygulamayı güncellediğinde eklenti de kendiliğinden güncellenir.',
      'İşler Instagram sayfasının düzenine dayanır. Instagram düğmelerin yerini değiştirirse bir iş beğenme sayısını ya da "daha fazla yorum"u bulamayabilir. O zaman gönderiyi kendin açabilirsin; eklenti gezerken de kaydeder.',
      "İş görünen bir Instagram sekmesinde, bir insan gibi çalışır. Yine de Instagram uyarı gösterebilir. Uygulama seni uyarır ama durdurmaz.",
      'Uygulamayı internete açma. Yalnızca kendi bilgisayarında çalıştır.',
    ],
  },

  faq: {
    intro: 'Bir şey beklediğin gibi gitmiyorsa önce buraya bak.',
    qCol: 'Belirti',
    aCol: 'Ne yapmalı',
    items: [
      { term: "Takipçi sayım Instagram'dakinden çok az.", text: 'ZIP istenirken tarih aralığı "Tüm zamanlar" seçilmemiş. Yeniden iste ve "Tüm zamanlar"ı seç.' },
      { term: '"followers_*.json / following.json bulunamadı" hatası', text: '"Takipçiler ve takip edilenler" işaretlenmemiş ya da biçim HTML seçilmiş. JSON ile tekrar iste.' },
      { term: '"JSON olarak okunamadı" hatası', text: 'Biçim HTML seçilmiş. Tekrar iste ve JSON seç.' },
      { term: '"Geçerli bir ZIP dosyası değil" hatası', text: 'Dosya yarım inmiş ya da açılıp yeniden sıkıştırılmış. İndirdiğin dosyayı olduğu gibi yükle.' },
      {
        term: 'Gözden çıkar sayfası "yeterli veri yok" diyor.',
        text: 'En az 10 gönderinin beğenenleri okunmuş olmalı. Köprü eklentisini kur, Gönderiler sayfasında önce "Gönderileri çek", sonra "Beğenenleri çek"e bas.',
        link: { to: '#kullanim', label: 'Nasıl' },
      },
      {
        term: 'Eklenti hiçbir şey kaydetmiyor.',
        text: 'Eklenti kendi kendine başlamaz. Gönderiler sayfasında ya da eklenti penceresinde "Gönderileri çek" ile başla. Kendin gezerken kaydetmesi için sağ üstteki anahtar ve o aracın kendi anahtarı açık olmalı. Kurulumdan ya da güncellemeden sonra Instagram sekmesini ve uygulama sayfasını yeniledin mi? Eklenti penceresindeki durum kutusu ne olduğunu yazar.',
        link: { to: '#kullanim', label: 'Kullanım' },
      },
      {
        term: 'Gönderiler sayfasındaki düğmeler soluk.',
        text: 'Uygulama sayfası eklentiyi bulamadı. Eklentiyi kur ya da güncelle, sonra sayfayı bir kez yenile.',
        link: { to: '#kopru', label: 'Kurulum' },
      },
      {
        term: 'Simgede kırmızı "!" var, uygulamada kırmızı şerit çıktı.',
        text: "Instagram bir uyarı göstermiş. Bu bir uyarı, engel değil; hiçbir şey kesilmedi. Önerimiz en az 24 saat (bir hafta içinde tekrarlarsa 72 saat) ara vermen. Instagram'ı telefonundan normal kullan, istenirse doğrulamayı kendin yap. Devam edersen daha yavaş git.",
        link: { to: '#uyari', label: 'Ayrıntı' },
      },
      {
        term: 'Eklentinin yeni sürümü gelmedi.',
        text: 'Eklenti birkaç saatte bir bakar. Hemen bakmak için eklenti penceresinde Güncelleme sekmesini aç ve "Şimdi denetle"ye bas. "Elle kurulum gerekiyor" yazıyorsa eklentiyi bir kez uygulama klasöründen yeniden yükle.',
        link: { to: '#guncelle', label: 'Güncelleme' },
      },
      {
        term: 'Eklenti "güncellendi" dedi ama kayıt olmuyor.',
        text: 'Açık Instagram sekmesini bir kez yenile. Güncellemeden önce açılmış sekme eski sürümle kalır.',
      },
      {
        term: 'InstaAnalytic klasörünü başka yere taşıdım.',
        text: 'Chrome eklentiyi o klasörden çalıştırır. chrome://extensions sayfasında eklentiyi kaldır, sonra "Paketlenmemiş öğe yükle" ile yeni yerdeki InstaAnalytic/frontend/extension klasörünü seç.',
      },
      { term: 'Hayalet görünen biri aslında aktif.', text: 'Hesap kısa süre kapalı kalmış olabilir. Takipten çıkmadan önce profiline kendin bak.' },
      { term: 'Bütün verimi silmek istiyorum.', text: 'Ayarlar sayfasında profili seç ve "Tüm verimi sil"e bas. Geri alınamaz.' },
    ],
  },

  files: {
    intro: 'Kurulumda ve denemede işine yarayacak dosyalar. Hepsi bu sayfada, bilgisayarında hazırlanır.',
    ext: {
      title: 'Köprü eklentisi, zip olarak (yedek yol)',
      text: 'Klasöre ulaşamıyorsan: zip olarak indir. Ama bu kopya kendiliğinden güncellenmez. Asıl yol, eklentiyi InstaAnalytic/frontend/extension klasöründen yüklemek; o zaman güncellemeler kendiliğinden gelir.',
      button: 'Zip olarak indir',
      building: 'Hazırlanıyor…',
      unavailable: 'Eklenti dosyaları bu kurulumda bulunamadı. Uygulamayı güncelleyip sayfayı yenile.',
      error: 'Eklenti paketlenemedi. Sayfayı yenileyip tekrar dene.',
      count: '{n} dosya',
    },
    samples: {
      title: 'Örnek ZIP dosyaları',
      text: "Instagram'ın gönderdiği dosyaların küçük birer örneği. İçinde 4 takipçi ve 5 takip edilen var; hepsi uydurma hesaplar.",
      tryIt: 'Ne beklendiğini görmek için açıp bakabilirsin. Denemek istersen Ayarlar sayfasında ayrı bir deneme profili aç ve ikisini ona yükle: 2 karşılıklı, 3 geri takip etmeyen, 2 senin geri takip etmediğin hesap görünür. Kendi profiline yükleme, gerçek listenin yerini alır.',
      button: 'İndir',
    },
    checklist: {
      title: 'Kontrol listesi',
      text: 'Tek sayfalık, yazdırılabilir özet. Kurarken yanında dursun.',
      button: 'Kontrol listesini indir',
    },
  },

  checklistDoc: {
    fileName: 'instaanalytic-kontrol-listesi.md',
    title: 'InstaAnalytic kontrol listesi',
    intro: 'Her adımı bitirince kutuyu işaretle.',
    groups: [
      {
        title: "1. Instagram'dan ZIP iste",
        items: [
          'Hesaplar Merkezi → Bilgilerini indir → Bilgileri indir veya aktar',
          'Bilgilerinin bir kısmı → yalnızca "Takipçiler ve takip edilenler"',
          'Cihaza indir',
          'Tarih aralığı: Tüm zamanlar (yoksa liste eksik gelir)',
          'Biçim: JSON (HTML değil)',
          'E-posta gelince ZIP dosyasını indir (bağlantı birkaç gün geçerli)',
        ],
      },
      {
        title: '2. Uygulamaya yükle',
        items: [
          'Kurulum sihirbazında kullanıcı adını gir (şifre yok)',
          "ZIP'i açmadan Ayarlar → Veri bölümüne bırak",
          'Takipçi sayısı Instagram\'dakiyle aşağı yukarı aynı mı, kontrol et',
        ],
      },
      {
        title: '3. Köprü eklentisini kur (isteğe bağlı)',
        items: [
          'InstaAnalytic klasörünü bul ("InstaAnalytic Kur.command" ya da "InstaAnalytic Kur.bat" dosyasının olduğu klasör)',
          'İçinde frontend → extension klasörüne bak: manifest.json orada, klasörü silme ve taşıma',
          'Adres çubuğuna chrome://extensions yaz (tıklanmaz, elle yazılır)',
          'Sağ üstte Geliştirici modu → aç',
          'Paketlenmemiş öğe yükle → InstaAnalytic/frontend/extension klasörünü seç (içinde manifest.json olan)',
          'Listede "InstaAnalytic Köprüsü" kartı var, "Hatalar" düğmesi yok',
          'Yapboz parçası → InstaAnalytic Köprüsü yanındaki raptiye',
          'Açık Instagram sekmesini bir kez yenile',
          'Eklenti simgesine tıkla, sağ üstteki anahtarı aç; Ayarlar sekmesinde profilini kontrol et',
          'Ayarlar sayfasında yeşil nokta ve "Dinliyor" görünüyor',
        ],
      },
      {
        title: '4. Eklentinin üç işi',
        items: [
          'Eklentiyi kurduktan ya da güncelledikten sonra uygulama sayfasını bir kez yenile',
          'Gönderiler sayfasında "Gönderileri çek"e bas (eklenti penceresinde de aynı düğme var)',
          'Eklenti bir Instagram sekmesi açar, işi yapar, bitince sekmeyi kendisi kapatır',
          '"Beğenenleri çek": okunmamış gönderiler sırayla açılır. Bir seferde 5–10 gönderi yeter, sonra "Durdur"',
          '"Yorumları çek": yorumu olan gönderilerin bütün yorumları yüklenir',
          'Tek gönderi için: gönderiye tıkla, "Bu gönderinin beğenenlerini çek" ya da "Bu gönderinin yorumlarını çek"',
          'Sekmeyi kapatırsan iş durur; yeniden başlatınca okunmuş gönderiler atlanır',
        ],
      },
      {
        title: '5. Karar vermeden önce',
        items: [
          'En az 10 gönderinin beğenenleri okundu',
          'Takipçi listesi eksiksiz ("Tüm zamanlar")',
          'Gözden çıkar listesini kendi gözünle gözden geçirdim',
          "Takipten çıkmayı Instagram'dan elle, günde birkaç düzineyi geçmeden yapacağım",
        ],
      },
      {
        title: 'Eklenti güncellemeleri',
        items: [
          'Yapman gereken bir şey yok: uygulama güncellenince eklenti kendini günceller',
          '"Eklenti X sürümüne güncellendi" yazınca açık Instagram sekmesini ve uygulama sayfasını bir kez yenile',
          'Zip kopyasından kurduysan ve "elle kurulum gerekiyor" yazıyorsa (bir kez): chrome://extensions → eski kartta Kaldır',
          'Sonra Paketlenmemiş öğe yükle → InstaAnalytic/frontend/extension klasörünü seç',
        ],
      },
      {
        title: 'Instagram uyarı verirse',
        items: [
          'Bu bir uyarı, engel değil; hiçbir şey kendiliğinden kesilmez',
          'Önerimiz: en az 24 saat ara ver (bir hafta içinde tekrarlarsa 72 saat)',
          "Instagram'ı telefonundan normal kullan",
          'Doğrulama istenirse kendin tamamla',
          'Devam edersen daha yavaş git',
          'Uyarıyı aşmaya çalışma',
        ],
      },
    ],
    footer: "Hatırlatma: hiçbir araç sıfır risk garanti edemez. Eklenti Instagram'a kendi isteğini göndermez, sayfayı bir insan gibi kullanır; yine de acele etme. Instagram uyarı gösterirse önerimiz ara vermen.",
  },
}

const en: GuideContent = {
  title: 'User guide',
  subtitle: 'Setting up for the first time? Start here. Each section takes a few minutes to read.',
  tocLabel: 'On this page',
  sections: {
    start: 'Getting started',
    zip: 'Add your data (ZIP)',
    bridge: 'Install the bridge',
    use: 'Use the extension',
    results: 'Reading the results',
    safety: 'Safety and limits',
    faq: 'FAQ and troubleshooting',
    files: 'Reference files',
  },

  start: {
    intro: 'Four steps to your first results. Your Instagram password is never asked for.',
    steps: [
      {
        title: 'Add your profile',
        text: 'Open the setup wizard and type your Instagram username. The username is all it needs.',
        link: { to: '/start', label: 'Setup wizard' },
      },
      {
        title: 'Upload your follower list',
        text: 'Drop the ZIP you requested from Instagram on the Settings page. The next section shows how to request it.',
        link: { to: '#zip', label: 'How to get the ZIP' },
      },
      {
        title: 'Save likers and comments (optional)',
        text: 'The ZIP does not say who liked or commented on your posts. For that, install the Browser bridge extension in Chrome. It has three separate jobs: Fetch posts, Fetch likers and Fetch comments. When you press one, the extension opens an Instagram tab and does the job there.',
        link: { to: '#kullanim', label: 'How to save them' },
      },
      {
        title: 'Look at the results',
        text: 'Follower Analysis is ready as soon as the ZIP is in. Cleanup and Follower Score need the likers of at least 10 posts.',
        link: { to: '/followers', label: 'Follower Analysis' },
      },
    ],
  },

  zip: {
    intro: 'The safest way is Instagram\'s own "Download your information" feature. With it, the app sends no requests to Instagram at all.',
    pathLabel: 'Short path',
    path: ['Accounts Center', 'Download your information', 'Some of your information', 'Followers and following', 'All time', 'JSON'],
    pathKey: ['All time', 'JSON'],
    requestTitle: 'Requesting the ZIP from Instagram',
    request: [
      { text: 'In Instagram: Profile → menu (☰) at the top right → Accounts Center. On a computer: Settings → Accounts Center.' },
      { text: '"Your information and permissions" → "Download your information" → "Download or transfer information".' },
      { text: 'Pick your account, then tap "Some of your information".' },
      { text: 'Tick only "Followers and following". Leave everything else, so the file stays small.' },
      { text: 'Choose "Download to device". Date range: "All time". Format: JSON. Then submit the request.' },
      { text: 'Instagram sends an email or notification when the file is ready. It can take minutes or hours. The download link expires after a few days.' },
    ],
    warningTitle: 'Set the date range to "All time"',
    warning: 'With any other range the lists come back incomplete. For example, you have 858 followers but the file lists only 94. Every result is then wrong as well.',
    uploadTitle: 'Uploading it',
    upload: [
      { text: 'On the Settings page, pick your profile and drop the ZIP on the Data section.', link: { to: '/settings', label: 'Settings' } },
      { text: 'No need to unzip it. Large files are fine: the file is opened in your browser and only the two lists are sent. Photos, videos and messages stay on your computer.' },
      { text: 'You can also pick followers_1.json and following.json on their own instead of the ZIP.' },
      { text: 'Each new upload also shows who joined and who left. Once a week is enough.' },
    ],
    filesTitle: 'What is read from the ZIP',
    fileCol: 'File',
    descCol: 'What it is',
    files: [
      { term: 'followers_1.json', text: 'People who follow you. Large accounts also get followers_2.json, followers_3.json and so on; all are read.' },
      { term: 'following.json', text: 'People you follow.' },
      { term: 'threads/ folder', text: 'Lists from the Threads app. Skipped on purpose so they do not mix with Instagram.' },
    ],
    noLikes: 'The ZIP has no likes or comments at all; Instagram does not export them. Use the extension in the next section to see who engages.',
  },

  bridge: {
    intro: 'The Browser bridge is a Chrome extension. It saves who liked and who commented on your own posts.',
    howTitle: 'How it works',
    how: 'The extension never sends its own requests to Instagram. It uses Instagram\'s own page like a person would: it scrolls and clicks. The page downloads the list itself, and the extension reads what came in. It has three separate jobs. Fetch posts: opens your profile in a new tab and scrolls to the end. Fetch likers: opens your posts whose likers are not read yet, one by one, clicks the likes count and scrolls the list to the end. Fetch comments: opens your posts that have comments and presses "load more comments" until all are loaded. Everything goes to the app on your computer.',
    rulesTitle: 'What this means',
    rules: [
      'No timers, no daily cap. A job only starts when you press a button.',
      'The job runs in a visible Instagram tab. You can watch what it does. Closing the tab stops the job.',
      'Only one job runs at a time. It waits a random 6–18 seconds between posts.',
      'It keeps working even if Instagram changes its addresses, because the extension never sends a request to any address itself.',
      'Only the likers and comments of your own posts are saved. The app ignores anything else the page loads.',
      'The data stays on your computer. The InstaAnalytic server never connects to Instagram.',
      'It never follows, likes, comments or sends messages. It only scrolls and opens lists.',
      'If Instagram shows a warning, the extension notices and tells you. It does not stop anything; the decision is yours. What to do is right below.',
    ],
    warning: {
      title: 'If Instagram shows a warning',
      intro: 'Please read this part. Instagram may show one of these. The extension notices it in the responses the page gets:',
      signs: [
        'A "Too many requests" error (429)',
        'A "Try again later" warning',
        'A verification screen such as "Confirm it\'s you"',
        'Instagram sending you to the login page',
      ],
      effectsTitle: 'What happens',
      effects: [
        'A red banner appears at the top of every page in the app. It says until when we suggest a break.',
        'The extension icon shows a red "!" badge, and the extension popup shows a red warning box.',
        'This is a warning, not a block. No job is cut off and no button is locked. Whether to continue is up to you.',
      ],
      doTitle: 'Our suggestion',
      do: [
        'Take a break: at least 24 hours. If it happens again within a week, 72 hours.',
        'Use Instagram from your phone as you normally would.',
        'If Instagram asks for verification, complete it yourself.',
        'If you continue, go slower: fewer posts at a time, longer breaks in between.',
      ],
      never: 'Never try to get around the warning. Do not remove and reinstall the extension, and do not try another browser, account or computer. That puts your account at greater risk.',
      alt: 'What it looks like after a warning: a red banner across the top of the app says until when a break is suggested and that nothing was stopped. The extension icon in the toolbar has a red exclamation mark.',
      caption: 'Red banner and a "!" on the icon: we suggest a break for a while.',
    },
    installTitle: 'Installing, step by step (about 5 minutes)',
    installIntro: 'Each picture marks what to click with a coloured frame and a number. The pictures are simplified versions of Chrome; yours may look a little different. You load the extension from the app\'s own folder. So you only do this once; when the app is updated, the extension updates itself too.',
    install: [
      {
        art: 'appFolder',
        title: 'Find the InstaAnalytic folder',
        text: 'Open the folder where you installed the app. It is the one with the "InstaAnalytic Kur.command" file ("InstaAnalytic Kur.bat" on Windows). Go into the frontend folder, then into the extension folder inside it: InstaAnalytic → frontend → extension. If you see a manifest.json file, you are in the right place.',
        tip: 'Do not delete or move this folder. Chrome runs the extension from it. If you do not remember where it is, search for "InstaAnalytic Kur" in Finder (File Explorer on Windows).',
        alt: 'The InstaAnalytic folder open in columns. In the first column, the frontend folder next to the "InstaAnalytic Kur.command" file is marked. In the second column, the extension folder is marked. The third column shows the manifest.json file and the words "right folder".',
        caption: 'InstaAnalytic → frontend → extension.',
      },
      {
        art: 'address',
        title: 'Open the Extensions page',
        text: 'Open a new tab in Chrome. Type chrome://extensions in the address bar at the top and press Enter.',
        tip: 'This address cannot be clicked like a link; Chrome does not allow it. Type it, or copy it with the button below and paste it into the address bar.',
        copy: 'chrome://extensions',
        alt: 'The Chrome address bar with chrome://extensions typed in. The Enter key is shown next to it.',
        caption: 'Type it in the address bar, press Enter.',
      },
      {
        art: 'devmode',
        title: 'Turn on Developer mode',
        text: 'There is a "Developer mode" switch in the top right corner of the Extensions page. Click it once; it lights up.',
        tip: 'This switch lets you load an extension from a folder on your computer. It changes nothing else.',
        alt: 'The Chrome Extensions page. The "Developer mode" switch at the top right is on and marked.',
        caption: '"Developer mode" must be on.',
      },
      {
        art: 'loadUnpacked',
        title: 'Click "Load unpacked"',
        text: 'New buttons appear at the top left once the switch is on. The first one is "Load unpacked". Click it and a folder picker opens.',
        alt: 'Three buttons at the top left of the Extensions page. The first one, "Load unpacked", is marked.',
        caption: 'The first button on the left.',
      },
      {
        art: 'pickFolder',
        title: 'Pick the extension folder',
        text: 'In the window that opens, go to the InstaAnalytic folder and open the frontend folder. Click the extension folder inside it once, then press "Select". The folder you pick is InstaAnalytic/frontend/extension.',
        tip: 'Do not pick the InstaAnalytic or the frontend folder. The right folder has a file called manifest.json inside.',
        alt: 'A folder picker with InstaAnalytic › frontend open. The extension folder is selected and marked; below it, it says manifest.json is inside. The "Select" button at the bottom right is marked.',
        caption: 'Pick the extension folder inside frontend.',
      },
      {
        art: 'card',
        title: 'Check that it is in the list',
        text: 'A card named "InstaAnalytic Köprüsü" appears in the list, with the app logo on its left and a version number under it (for example 2.4.0). The switch at the bottom right of the card should be on.',
        tip: 'If the card shows a red "Errors" button, something went wrong. See "If the install did not work" below.',
        alt: 'The InstaAnalytic Köprüsü 2.4.0 card on the Extensions page is marked, with the app logo on its left. Next to it, a red "Errors" button is shown as a sign of trouble.',
        caption: 'If the card is there, it is installed.',
      },
      {
        art: 'pin',
        title: 'Pin it to the toolbar',
        text: 'Click the puzzle-piece icon (Extensions) to the right of the address bar. In the list, press the pin next to InstaAnalytic Köprüsü. Its icon now stays visible. The icon is the app logo: three rising white bars on an orange square.',
        alt: 'The puzzle-piece icon in the Chrome toolbar is marked. In the Extensions list that opens, the pin icon on the InstaAnalytic Köprüsü row, next to the InstaAnalytic logo, is marked.',
        caption: 'Puzzle piece first, then the pin.',
      },
      {
        art: 'reload',
        title: 'Reload the Instagram tab',
        text: 'If Instagram is already open in a tab, reload that tab once. The extension does not work in an Instagram tab that was opened before the install. If it is not open, open instagram.com and log in.',
        tip: 'To reload, press the round arrow left of the address bar, or press F5 (Cmd+R on a Mac).',
        alt: 'A Chrome window with an Instagram tab. The reload icon left of the address bar is marked. The F5 and Cmd+R keys are shown below.',
        caption: 'Reload the tab once.',
      },
      {
        art: 'popup',
        title: 'Open the extension and turn on the bridge',
        text: 'Click the extension icon, turn on the switch at the top right; check your profile on the Ayarlar (settings) tab. The popup has three tabs at the top: Araçlar (tools), Ayarlar and Güncelleme (update). On the Ayarlar tab, the Profil row should show your profile. If not, press "Değiştir" (change) and pick it.',
        tip: 'Each of the three cards on the Araçlar tab has a job button: Gönderileri çek (fetch posts), Beğenenleri çek (fetch likers) and Yorumları çek (fetch comments). The next section shows how to use them.',
        alt: 'The extension popup with the Araçlar tab open. The extension icon in the toolbar, the switch at the top right of the popup and the Ayarlar tab are marked in order. Below are the Gönderi listesi, Beğenenler and Yorumlar cards with the Gönderileri çek, Beğenenleri çek and Yorumları çek buttons. The status box shows a green dot and "Dinliyor.".',
        caption: 'Icon, the switch at the top right, then your profile on the Ayarlar tab.',
      },
      {
        art: 'connected',
        title: 'Check that it is connected',
        text: 'In the app, open Settings or Cleanup. If the "Browser bridge" card shows a green dot and "Listening", you are done.',
        tip: 'If you do not see it, reload the Instagram tab once, then reload the app page too. The app page talks to the extension directly; after installing or updating the extension, reload the app page once.',
        link: { to: '/settings', label: 'Settings' },
        alt: 'The Browser bridge card on the Settings page of the app. The green dot and "Listening" are marked.',
        caption: 'Green dot: the extension is listening.',
      },
    ],
    ui: {
      appFolder: 'InstaAnalytic',
      installerFile: 'InstaAnalytic Kur.command',
      appFolderHint: 'The folder with the Kur file',
      rightFolder: 'right folder',
      appTab: 'InstaAnalytic',
      downloads: 'Downloads',
      desktop: 'Desktop',
      documents: 'Documents',
      typeHere: 'Type here',
      newTab: 'New tab',
      enterKey: 'Enter ↵',
      extensionsTitle: 'Extensions',
      searchExtensions: 'Search extensions',
      devMode: 'Developer mode',
      loadUnpacked: 'Load unpacked',
      packExtension: 'Pack extension',
      update: 'Update',
      pickTitle: 'Select folder',
      select: 'Select',
      cancel: 'Cancel',
      folderContents: 'inside: manifest.json, popup.html…',
      extName: 'InstaAnalytic Köprüsü',
      extVersion: '2.4.0',
      details: 'Details',
      remove: 'Remove',
      errors: 'Errors',
      errorsHint: 'This button means trouble',
      manageExtensions: 'Manage extensions',
      reloadOr: 'or',
      reloadWin: 'Windows',
      reloadMac: 'Mac',
      // Eklenti penceresi yalnızca Türkçe; resim gerçeğiyle aynı kalsın.
      ...POPUP,
      settingsHeading: 'Settings',
      bridgeTitle: 'Browser bridge',
      bridgeConnected: 'Listening',
      bridgeDesc: 'Saves the likers lists you open on Instagram.',
      bridgeFound: '50 posts found',
      bridgeProgress: '12 / 50 posts read',
      igHandle: 'gktuoktay',
      igStats: '50 posts · 858 followers · 412 following',
      igLikes: '214 likes',
      igLikersTitle: 'Likes',
      igMoreComments: 'Load more comments',
      scrollToEnd: 'Scrolls to the end',
      scrollList: 'Scrolls to the end',
      clickHere: 'click',
      warnBanner: 'Instagram showed a warning for @gktuoktay. We suggest a break until 11/3/2026, 2:30 PM.',
      warnBannerTodo: 'Nothing was stopped; whether to continue is up to you.',
      appPostsTitle: 'Post Analysis',
      appRun: { posts: 'Fetch posts', likers: 'Fetch likers', comments: 'Fetch comments' },
      // İşin yazısı eklentiden gelir; eklenti yalnızca Türkçe
      appJobMsg: 'Beğenenler: 3 / 12',
      appStop: 'Stop',
      appJobNote: 'The extension is working in an Instagram tab and closes it when done. Closing the tab stops the job.',
      appOpenIg: 'Open on Instagram',
      appRunLikersOne: 'Fetch this post\'s likers',
      appRunCommentsOne: 'Fetch this post\'s comments',
      appLikesTab: 'Likes (214)',
      appCommentsTab: 'Comments (9)',
    },
    copy: { button: 'Copy', done: 'Copied', failed: 'Could not copy. Type it instead.' },
    stepLabel: 'Step',
    zipNote: {
      text: 'If you cannot get to the folder, you can also download the extension as a zip. But that copy does not update itself; when a new version comes out you will have to remove it once and load it from the app folder.',
      link: { to: '#referans', label: 'Download as zip' },
    },
    troubleTitle: 'If the install did not work',
    troubleIntro: 'The most common cases and how to fix them:',
    trouble: [
      { term: 'There is no "Load unpacked" button.', text: 'Developer mode is off. Turn on the switch at the top right of the Extensions page.' },
      {
        term: '"Manifest file is missing or unreadable" error',
        text: 'The wrong folder was picked. Pick the extension folder, not the InstaAnalytic or the frontend folder above it. The right folder has manifest.json inside.',
      },
      { term: 'The extension says to reload the Instagram tab.', text: 'The Instagram tab was opened before the install. Reload it once (F5, Cmd+R on a Mac).' },
      { term: 'The popup says "Uygulama kapalı" (app is closed).', text: 'InstaAnalytic is not running. Start the app. The extension reconnects on its own within a few minutes.' },
      { term: 'The extension card has a red "Errors" button.', text: 'Press it and read the message. Usually the wrong folder was picked. Remove the extension and load the right folder again.' },
      { term: 'The extension icon is not in the toolbar.', text: 'Click the puzzle-piece icon and press the pin next to InstaAnalytic Köprüsü.' },
      { term: 'The card still says the extension has not connected.', text: 'Is the switch at the top right of the popup on and a profile picked? Reload the Instagram tab once, then reload the app page too.' },
      {
        term: 'The card says "Eklentin güncel değil" (your extension is out of date).',
        text: 'The extension updates itself within a few hours. If you do not want to wait, open the Güncelleme tab in the popup and press "Şimdi denetle" (check now). If it says manual install is needed, see the next row.',
        link: { to: '#guncelle', label: 'Updating' },
      },
      {
        term: 'The extension says "elle kurulum gerekiyor" (manual install needed).',
        text: 'You installed it from a downloaded zip copy. That copy cannot update itself. Do this once: remove the old one on chrome://extensions, then use "Load unpacked" to pick the InstaAnalytic/frontend/extension folder. Later updates then arrive on their own.',
        link: { to: '#guncelle', label: 'Step by step' },
      },
      {
        term: 'It said it was updated, but nothing is saved.',
        text: 'The open Instagram tab is still running the old version. Reload the tab once (F5, Cmd+R on a Mac).',
      },
    ],
    update: {
      title: 'Updating the extension',
      intro: 'Normally there is nothing to do. The extension is loaded from the app\'s folder, so it is updated together with the app.',
      steps: [
        { text: 'When the app is updated, the extension\'s files are updated too. You do not need to download or copy anything.' },
        { text: 'Every few hours the extension checks the app for a newer version. It also checks when you open its popup and when an Instagram page loads.' },
        { text: 'If there is a newer version, the extension reloads itself and says "Eklenti X sürümüne güncellendi. Açık Instagram sekmesini bir kez yenileyin." (updated to version X, reload the open Instagram tab once).' },
        { text: 'Reload the open Instagram tab and the app page once. That is all.' },
      ],
      tip: 'To check right away, open the Güncelleme tab in the popup and press "Şimdi denetle" (check now). If both versions match, it says "Güncel" (up to date).',
      alt: 'The extension popup with the Güncelleme tab open. Yüklü sürüm (installed) 2.4.0, Uygulamadaki sürüm (in the app) 2.4.0; the status line shows a green dot and "Güncel". The Güncelleme tab and the "Şimdi denetle" button are marked in order.',
      caption: 'The Güncelleme tab: matching versions mean "Güncel".',
      fixTitle: 'If you installed it from a zip file (done once)',
      fixIntro: 'A downloaded zip copy cannot update itself. When a new version comes out, the extension notices: an orange "↑" appears on its icon, and the Güncelleme tab says "Yeni sürüm var (X). Bu kopya kendiliğinden güncellenemiyor." (a new version exists; this copy cannot update itself). The Browser bridge card in the app also says your extension is out of date. Do this once, and later updates arrive on their own:',
      fixSteps: [
        { text: 'Open chrome://extensions. On the "InstaAnalytic Köprüsü" card, press "Remove". The likers you saved stay in the app; nothing is deleted. If an Instagram warning is active, do this after it is over.' },
        { text: 'Press "Load unpacked" and pick the InstaAnalytic/frontend/extension folder (the one with manifest.json).', link: { to: '#kurulum-1', label: 'Install steps' } },
        { text: 'Open the popup. Turn on the switch at the top right and check your profile on the Ayarlar (settings) tab.' },
        { text: 'Reload the open Instagram tab once. You can delete the old downloaded folder now.' },
      ],
      fixAlt: 'The extension popup with the Güncelleme tab open. The extension icon in the toolbar has an orange "↑". The status line shows an orange dot and "Yeni sürüm var, elle kurulum gerekiyor", with the note "Bu kopya kendiliğinden güncellenemiyor." under it. The icon and the status line are marked in order.',
      fixCaption: 'Orange "↑": load this copy once more from the app folder.',
    },
  },

  use: {
    intro: 'The extension has three separate jobs: Fetch posts, Fetch likers and Fetch comments. When you start one, the extension opens a new Instagram tab and does the job there, where you can see it: it scrolls and clicks. It sends no requests of its own to Instagram. When the job is done, it closes the tab itself.',
    stepsTitle: 'Where to start a job',
    stepsIntro: 'There are three places. The job is the same whichever you use. Only one job runs at a time.',
    steps: [
      {
        art: 'appJobs',
        title: 'In the app: the Posts page',
        text: 'Open the Posts page in the app. To the right of the title there are three buttons: "Fetch posts", "Fetch likers" and "Fetch comments". Press one. A job box appears below: the job message (for example "Beğenenler: 3 / 12", likers 3 of 12), a progress bar and a "Stop" button. The list refreshes by itself as data comes in.',
        tip: 'If the buttons are dimmed and the page says the jobs run through the browser bridge extension, which was not found on this page, the extension is not installed or this page was opened before it. Install or update the extension, then reload the page once.',
        link: { to: '/posts', label: 'Posts' },
        alt: 'The Posts page of the app. The Fetch posts, Fetch likers and Fetch comments buttons to the right of the title are marked. Below, in the job box, the text "Beğenenler: 3 / 12" with the progress bar and the "Stop" button on the right are marked in order.',
        caption: 'Three buttons; the running job in the box below.',
      },
      {
        art: 'postDetail',
        title: 'For a single post',
        text: 'On the Posts page, click a post. The panel that opens has two buttons at the top: "Fetch this post\'s likers" and "Fetch this post\'s comments". The extension opens only that post. Use this when a post got more likes later or a list is missing something.',
        tip: 'On a post without comments, the comments button is dimmed.',
        alt: 'The post panel opened on the Posts page. The top row shows the likes and comments count and an "Open on Instagram" link. The "Fetch this post\'s likers" and "Fetch this post\'s comments" buttons on the right are marked in order.',
        caption: 'Two buttons in the panel, for this post only.',
      },
      {
        art: 'popupJobs',
        title: 'From the extension popup',
        text: 'Click the extension icon in the toolbar. Each card on the Araçlar (tools) tab has its own job button: "Gönderileri çek" (fetch posts), "Beğenenleri çek" (fetch likers) and "Yorumları çek" (fetch comments). While a job runs, a job bar appears above the cards: a spinner, the job message and "Durdur" (stop). The buttons are dimmed meanwhile.',
        tip: 'The job buttons work regardless of the card switches. The switches only turn saving while you browse on or off.',
        alt: 'The extension popup, Araçlar tab. The job bar above the cards shows a spinner, "Beğenenler: 3 / 12" and a "Durdur" button. The Gönderileri çek, Beğenenleri çek and Yorumları çek buttons and the job bar are marked in order.',
        caption: 'A job button on each card; the running job on top.',
      },
    ],
    stop: {
      title: 'Stopping',
      text: 'To stop a job, press "Stop" in the job box in the app or "Durdur" in the job bar of the popup. Closing the Instagram tab also stops the job. Everything read until then stays saved. To continue, start the job again; posts already read are skipped.',
    },
    toolsTitle: 'The three jobs, what they do',
    toolsIntro: 'Go in order: posts first, then likers, then comments. Likers and comments work from the post list.',
    toolLabel: 'Job',
    tools: [
      {
        id: 'posts',
        title: 'Fetch posts (Gönderileri çek)',
        what: 'Saves your posts with their date, likes and comments count. The other two jobs work from this list, so do this first. Repeat it when you share a new post.',
        steps: [
          {
            art: 'useProfile',
            title: 'Opens your profile and scrolls to the end',
            text: 'The extension opens your profile in a new Instagram tab and slowly scrolls down until the end of your posts. Then it closes the tab. The card shows "N gönderi bulundu" (N posts found).',
            alt: 'An Instagram profile page with a grid of posts. On the right, a downward arrow and "Scrolls to the end" are marked. Below it, the extension\'s Gönderi listesi card showing "50 gönderi bulundu" (50 posts found) is marked.',
            caption: 'The extension scrolls: "50 gönderi bulundu".',
          },
        ],
      },
      {
        id: 'likers',
        title: 'Fetch likers (Beğenenleri çek)',
        what: 'Saves who liked your posts. Opens your posts whose likers are not read yet, one by one, at most 50 posts per run.',
        steps: [
          {
            art: 'useLikes',
            title: 'Clicks the likes count and scrolls the list',
            text: 'The extension opens the post, clicks the "X likes" text under the photo and scrolls the list to the end. Then it waits 6–18 seconds and moves on to the next post in the same tab. On the card the bar fills and the count of read posts goes up. When all are done, the button says "Hepsi okundu" (all read).',
            alt: 'An open Instagram post. The "214 likes" text under the photo is marked. Next to it, the Likes list that opened and "Scrolls to the end" under it are marked.',
            caption: 'The extension clicks "214 likes" and scrolls the list to the end.',
          },
        ],
        tip: { title: 'No rush', text: '5–10 posts at a time is plenty. Then press "Stop" and spread the rest over a few days. This matters even more if your account is new or has had a warning before.' },
      },
      {
        id: 'comments',
        title: 'Fetch comments (Yorumları çek)',
        what: 'Saves who commented on your posts. Opens only the posts that have comments.',
        steps: [
          {
            art: 'comments',
            title: 'Loads all comments',
            text: 'The extension opens the post and presses "load more comments" until all comments are loaded. The commenters are saved. Then it moves on to the next post.',
            alt: 'An open Instagram post. The comments on the right and the "Load more comments" button under them are marked in order. Next to it, the extension\'s Yorumlar card showing "9 gönderinin yorumları kaydedildi" (comments saved for 9 posts) is marked.',
            caption: 'The extension presses "load more comments"; the commenters are saved.',
          },
        ],
      },
    ],
    passive: {
      title: 'It also saves while you browse',
      text: 'This works without starting a job too. When you scroll your own profile on Instagram, open the likes list of a post or open one of your posts, the extension saves what the page downloaded. For that, the switch at the top right and that tool\'s own switch must be on.',
    },
    off: {
      title: 'The switches',
      text: 'Each card has its own small switch. It only turns saving while you browse on or off: a tool that is off saves nothing while you browse. The job buttons work regardless of the switches. The big switch at the top right turns saving while you browse off for all of them at once. The status box then says "Köprü kapalı. Sağ üstteki anahtarla açın." (the bridge is off; turn it on with the switch at the top right).',
      alt: 'The extension popup, Araçlar tab. The Yorumlar card is off and dimmed; its small switch is marked. The big switch at the top right is marked second.',
      caption: 'A tool that is off is dimmed and saves nothing while you browse.',
    },
    troubleTitle: 'If something goes wrong',
    trouble: [
      {
        term: 'The buttons are dimmed and it says the extension was not found on this page.',
        text: 'The app page could not find the extension. Install it or update it to version 2.4.0, then reload the app page once. The extension adds a small script to the app page; that script only loads when the page is reloaded.',
        link: { to: '#kopru', label: 'Install' },
      },
      { term: 'It says the extension did not answer.', text: 'Reload the app page and try again. If the extension was just updated, the page may still have the old connection.' },
      {
        term: 'It says "Önce Instagram\'ı bir sekmede açıp eklentide profilinizi seçin" (open Instagram and pick your profile first).',
        text: 'The extension does not know yet which profile to work for. Open Instagram in a tab, then pick your profile on the Ayarlar (settings) tab of the popup.',
      },
      { term: 'It says "Zaten çalışan bir iş var" (a job is already running).', text: 'Only one job runs at a time. Wait for it to finish or press "Stop".' },
      {
        term: 'The job started but no likers came in.',
        text: 'The post may have hidden likes, or the list did not open. Try "Fetch this post\'s likers" on that post. If that does not help, open the post yourself, click the likes count and scroll the list to the end.',
      },
      { term: 'I closed the tab.', text: 'The job stopped. Everything read until then is saved. Start the job again; posts already read are skipped.' },
      {
        term: 'The card says "Henüz gönderi yok" (no posts yet) or "Önce gönderi listesi gerekli" (post list needed first).',
        text: 'Run "Fetch posts" first. Likers and comments work from the post list.',
      },
      {
        term: 'The likers button says "Hepsi okundu" (all read).',
        text: 'The likers of all your posts are read. If you shared a new post, run "Fetch posts" first. To refresh the list of a single post, use "Fetch this post\'s likers" in the post panel.',
      },
      {
        term: 'The card says another @account is open on Instagram.',
        text: 'A different Instagram account is logged in in Chrome. Nothing is saved for it. Switch to this profile\'s account on Instagram, or pick the right profile in the popup.',
      },
      { term: 'I opened someone else\'s post and nothing was saved.', text: 'That is on purpose. Only the likers and comments of your own posts are saved.' },
    ],
    afterTitle: 'After that',
    after: 'The Beğenenler card in the popup shows how many posts are read. The bridge card and the Posts page in the app show it too. When you share a new post, run "Fetch posts" first, then "Fetch likers". If a post gets more likes later, read only that one again with "Fetch this post\'s likers" in the post panel.',
    limitTitle: 'To be clear',
    limit: 'The job runs in a visible Instagram tab and uses the page like a person would: it scrolls and clicks. It sends no requests of its own to Instagram. Instagram may still show warnings; no tool can promise zero risk. If a warning comes, the app warns you but does not stop you. Whether to continue is up to you.',
  },

  results: {
    intro: 'Each page answers a different question.',
    pagesTitle: 'Pages',
    pages: [
      {
        term: 'Follower Analysis',
        text: 'Three lists: people who do not follow you back, mutuals, and ghosts. A ghost is a deleted or frozen account. They are checked one by one in a browser with no login and no cookies; your account is never involved.',
        link: { to: '/followers', label: 'Open' },
      },
      { term: 'Posts', text: 'Your posts and which of them have their likers list read. The Fetch posts, Fetch likers and Fetch comments buttons are here too.', link: { to: '/posts', label: 'Open' } },
      { term: 'Engagement Report', text: 'Average likes and comments per post, and the days and hours you get the most engagement.', link: { to: '/report', label: 'Open' } },
      {
        term: 'Follower Score',
        text: 'A 0–100 score for each follower, based on how much they liked and commented on your recent posts. Also shows who is warming up or cooling down.',
        link: { to: '/fans', label: 'Open' },
      },
      { term: 'Cleanup', text: 'Groups the people you follow and your followers by engagement. The groups are explained below.', link: { to: '/cleanup', label: 'Open' } },
      { term: 'Queue Monitor', text: 'Jobs that are waiting or running. Shows why a job is waiting.', link: { to: '/monitor', label: 'Open' } },
      { term: 'Action History', text: 'Every follow and unfollow the app made, with dates.', link: { to: '/actions', label: 'Open' } },
    ],
    groupsTitle: 'Cleanup groups',
    groupsNote: 'This page looks at who liked or commented on your most recently read posts. For the result to be right, the likers of at least 10 posts must be read and the follower list must be complete ("All time" in the ZIP).',
    groups: [
      { term: 'Ghosts', text: 'Deleted or frozen accounts. Following them no longer means anything. The easiest group to drop.' },
      { term: 'You follow them, they do not follow you, no engagement', text: 'They do not follow back and have no likes or comments on your read posts. Most unfollow candidates are here.' },
      { term: 'Mutual but quiet', text: 'You follow each other but they never touch your posts. Often a real acquaintance; take your time.' },
      { term: 'Quiet follower', text: 'Follows you but does not engage. Usually nothing to do here.' },
      { term: 'Loyal', text: 'People who like and comment regularly. Your most valuable followers.' },
    ],
    decideTitle: 'Deciding who to drop',
    decide: [
      'Start with ghosts. No thinking needed.',
      'Go through the list yourself once. Family, friends or work contacts can matter even if they never engage.',
      'Celebrities, brands and news accounts will not follow you back anyway. If you follow them for their content, it is normal that they show up.',
      'Engagement on new posts may still be incomplete. Decide after the likers of at least 10 posts are read.',
      "Unfollowing by hand in Instagram, no more than a few dozen a day, is the safest. The app's own follow/unfollow actions are off by default.",
    ],
  },

  safety: {
    intro: "The app's core rule is to never trigger Instagram's spam protection. These always apply:",
    topicCol: 'Topic',
    ruleCol: 'Rule',
    rows: [
      { term: 'Password', text: 'Never asked for, never stored.' },
      { term: 'ZIP data', text: 'No requests go to Instagram.' },
      { term: 'Saving likers and comments', text: 'The extension sends no requests of its own to Instagram. In a visible Instagram tab it uses the page like a person (scrolls, clicks) and reads the list the page downloaded. The server does not connect to Instagram.' },
      { term: 'When it saves', text: 'Only when you start a job or while you browse yourself. No timers, no daily cap. Only one job runs at a time; it waits a random 6–18 seconds between posts.' },
      { term: 'What is not saved', text: 'Other people\'s posts, data from tools you turned off, and anything else the page loads. The app ignores them.' },
      { term: 'Ghost check', text: 'Done in a browser with no login and no cookies. Not linked to your account.' },
      {
        term: 'If a warning appears',
        text: 'A red banner appears in the app and a red "!" on the extension icon. This is a warning, not a block; nothing is cut off. We suggest a break of at least 24 hours (72 if it happens again within a week).',
        link: { to: '#uyari', label: 'What to do' },
      },
      { term: 'Follow / unfollow', text: 'Off by default. Even when on: at most 15 an hour, 60 a day, at least 60 seconds apart. If Instagram blocks one of these actions, the app holds its own follow actions for 6 hours.' },
      { term: 'Your data', text: 'Stays on your computer. "Delete all my data" on the Settings page removes everything.', link: { to: '/settings', label: 'Settings' } },
    ],
    riskTitle: 'What the risk profile changes',
    risk: "Settings has three profiles: Safe, Balanced, Aggressive. The profile sets the waits and limits for the app's own follow and unfollow actions. It does not affect the bridge; the bridge jobs always wait 6–18 seconds between posts. Safe is enough for most people. Aggressive makes a warning noticeably more likely.",
    limitsTitle: 'Known limits',
    limits: [
      'Instagram does not publish its thresholds. The numbers here are estimates.',
      'No setting guarantees your account will not be restricted. Settings only lower the risk.',
      'The extension does not depend on Instagram\'s addresses. But if the format of the data the page downloads changes a lot, it may not recognise the list; then a new version of the extension is needed. When you update the app, the extension updates itself too.',
      'The jobs depend on the layout of Instagram\'s page. If Instagram moves its buttons, a job may not find the likes count or "load more comments". Then you can open the post yourself; the extension also saves while you browse.',
      'The job runs in a visible Instagram tab, like a person. Instagram may still show warnings. The app warns you but does not stop you.',
      'Do not expose the app to the internet. Run it only on your own computer.',
    ],
  },

  faq: {
    intro: 'If something does not go as expected, look here first.',
    qCol: 'Symptom',
    aCol: 'What to do',
    items: [
      { term: 'My follower count is far lower than on Instagram.', text: 'The ZIP was requested without "All time". Request it again and pick "All time".' },
      { term: '"followers_*.json / following.json not found" error', text: '"Followers and following" was not ticked, or the format was HTML. Request it again as JSON.' },
      { term: '"Could not be read as JSON" error', text: 'The format was HTML. Request it again and pick JSON.' },
      { term: '"Not a valid ZIP file" error', text: 'The download was cut off, or the file was unzipped and zipped again. Upload the file exactly as downloaded.' },
      {
        term: 'Cleanup says there is not enough data.',
        text: 'The likers of at least 10 posts must be read. Install the bridge extension, then on the Posts page press "Fetch posts" first and "Fetch likers" after.',
        link: { to: '#kullanim', label: 'How' },
      },
      {
        term: 'The extension saves nothing.',
        text: 'The extension does not start on its own. Start with "Fetch posts" on the Posts page or in the popup. To save while you browse, the switch at the top right and that tool\'s own switch must be on. Did you reload the Instagram tab and the app page after installing or updating? The status box in the extension popup says what is going on.',
        link: { to: '#kullanim', label: 'Using it' },
      },
      {
        term: 'The buttons on the Posts page are dimmed.',
        text: 'The app page could not find the extension. Install or update the extension, then reload the page once.',
        link: { to: '#kopru', label: 'Install' },
      },
      {
        term: 'The icon has a red "!" and the app shows a red banner.',
        text: 'Instagram showed a warning. This is a warning, not a block; nothing was cut off. We suggest a break of at least 24 hours (72 if it happens again within a week). Use Instagram normally from your phone and complete any verification yourself. If you continue, go slower.',
        link: { to: '#uyari', label: 'Details' },
      },
      {
        term: 'The new version of the extension has not arrived.',
        text: 'The extension checks every few hours. To check now, open the Güncelleme tab in the popup and press "Şimdi denetle" (check now). If it says manual install is needed, load the extension once from the app folder.',
        link: { to: '#guncelle', label: 'Updating' },
      },
      {
        term: 'It said it was updated, but nothing is saved.',
        text: 'Reload the open Instagram tab once. A tab opened before the update keeps the old version.',
      },
      {
        term: 'I moved the InstaAnalytic folder.',
        text: 'Chrome runs the extension from that folder. Remove the extension on chrome://extensions, then use "Load unpacked" to pick the InstaAnalytic/frontend/extension folder in its new place.',
      },
      { term: 'Someone marked as a ghost is actually active.', text: 'The account may have been off for a short time. Check their profile yourself before unfollowing.' },
      { term: 'I want to delete all my data.', text: 'On the Settings page, pick the profile and press "Delete all my data". This cannot be undone.' },
    ],
  },

  files: {
    intro: 'Files that help with setup and trying things out. All of them are prepared on your computer, in this page.',
    ext: {
      title: 'Bridge extension as a zip (fallback)',
      text: 'If you cannot get to the folder: download it as a zip. But that copy does not update itself. The main way is to load the extension from the InstaAnalytic/frontend/extension folder; then updates arrive on their own.',
      button: 'Download as zip',
      building: 'Preparing…',
      unavailable: 'The extension files were not found in this install. Update the app and reload the page.',
      error: 'Could not package the extension. Reload the page and try again.',
      count: '{n} files',
    },
    samples: {
      title: 'Sample ZIP files',
      text: 'Small copies of the files Instagram sends. They hold 4 followers and 5 followed accounts, all made up.',
      tryIt: 'Open them to see the expected format. To try the app, create a separate test profile in Settings and upload both there: you will see 2 mutuals, 3 who do not follow back, and 2 you do not follow back. Do not upload them to your own profile; they would replace your real lists.',
      button: 'Download',
    },
    checklist: {
      title: 'Checklist',
      text: 'A one-page printable summary to keep next to you while setting up.',
      button: 'Download checklist',
    },
  },

  checklistDoc: {
    fileName: 'instaanalytic-kontrol-listesi.md',
    title: 'InstaAnalytic checklist',
    intro: 'Tick each box when the step is done.',
    groups: [
      {
        title: '1. Request the ZIP from Instagram',
        items: [
          'Accounts Center → Download your information → Download or transfer information',
          'Some of your information → only "Followers and following"',
          'Download to device',
          'Date range: All time (otherwise the list is incomplete)',
          'Format: JSON (not HTML)',
          'Download the ZIP when the email arrives (the link lasts a few days)',
        ],
      },
      {
        title: '2. Upload it',
        items: [
          'Enter your username in the setup wizard (no password)',
          'Drop the ZIP, still zipped, on Settings → Data',
          'Check that the follower count roughly matches Instagram',
        ],
      },
      {
        title: '3. Install the bridge extension (optional)',
        items: [
          'Find the InstaAnalytic folder (the one with "InstaAnalytic Kur.command" or "InstaAnalytic Kur.bat")',
          'Look inside frontend → extension: manifest.json is there; do not delete or move the folder',
          'Type chrome://extensions in the address bar (it cannot be clicked)',
          'Top right: turn on Developer mode',
          'Load unpacked → pick the InstaAnalytic/frontend/extension folder (the one with manifest.json)',
          'The "InstaAnalytic Köprüsü" card is in the list, with no "Errors" button',
          'Puzzle piece → pin next to InstaAnalytic Köprüsü',
          'Reload the open Instagram tab once',
          'Click the extension icon, turn on the switch at the top right; check your profile on the Ayarlar (settings) tab',
          'Settings shows a green dot and "Listening"',
        ],
      },
      {
        title: '4. The three jobs of the extension',
        items: [
          'After installing or updating the extension, reload the app page once',
          'On the Posts page, press "Fetch posts" (the popup has the same button: "Gönderileri çek")',
          'The extension opens an Instagram tab, does the job and closes the tab itself when done',
          '"Fetch likers": unread posts open one by one. 5–10 posts at a time is plenty, then "Stop"',
          '"Fetch comments": all comments of the posts that have comments are loaded',
          'For a single post: click the post, then "Fetch this post\'s likers" or "Fetch this post\'s comments"',
          'Closing the tab stops the job; when you start it again, posts already read are skipped',
        ],
      },
      {
        title: '5. Before deciding',
        items: [
          'The likers of at least 10 posts are read',
          'The follower list is complete ("All time")',
          'I went through the Cleanup list myself',
          'I will unfollow by hand in Instagram, no more than a few dozen a day',
        ],
      },
      {
        title: 'Extension updates',
        items: [
          'Nothing to do: when the app is updated, the extension updates itself',
          'When it says "Eklenti X sürümüne güncellendi", reload the open Instagram tab and the app page once',
          'If you installed from a zip copy and it says manual install is needed (once): chrome://extensions → Remove on the old card',
          'Then Load unpacked → pick the InstaAnalytic/frontend/extension folder',
        ],
      },
      {
        title: 'If Instagram shows a warning',
        items: [
          'It is a warning, not a block; nothing is cut off',
          'Our suggestion: take a break of at least 24 hours (72 if it happens again within a week)',
          'Use Instagram normally from your phone',
          'Complete any verification yourself',
          'If you continue, go slower',
          'Do not try to get around the warning',
        ],
      },
    ],
    footer: 'Reminder: no tool can promise zero risk. The extension sends no requests of its own to Instagram and uses the page like a person; still, do not rush. If Instagram shows a warning, we suggest a break.',
  },
}

const CONTENT: Record<GuideLang, GuideContent> = { tr, en }

export const guideContent = (lang: string): GuideContent => CONTENT[lang === 'en' ? 'en' : 'tr']
