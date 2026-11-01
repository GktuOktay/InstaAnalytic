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
  | 'useToggle' | 'postsOpen' | 'useProfile' | 'likersNext' | 'useLikes' | 'likersProgress' | 'comments' | 'toolOff'
  | 'updateTab' | 'updateManual'

/** Eklenti penceresinin Araçlar sekmesindeki üç ayrı araç. Her birinin kendi anahtarı var. */
export type ToolId = 'posts' | 'likers' | 'comments'
export const TOOL_IDS: ToolId[] = ['posts', 'likers', 'comments']
/** Kullanım bölümündeki araç bloklarının çapaları (/guide#begenenler gibi). */
export const TOOL_ANCHOR: Record<ToolId, string> = { posts: 'gonderi-listesi', likers: 'begenenler', comments: 'yorumlar' }

/** Eklenti penceresindeki bir araç kartının yazıları (popup.html ile aynı). `action` kartın düğmesi. */
export interface PopupToolLabels { title: string; desc: string; stat: string; action?: string }

/** Kullanım bölümünde bir araç: ne kaydettiği ve resimli adımları. */
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
  scrollToEnd: string
  scrollList: string
  clickHere: string
  warnBanner: string
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
    /** Başlarken: pencereyi açıp ana anahtarı açmak. */
    stepsTitle: string
    steps: InstallStep[]
    /** Üç araç, her biri ayrı bir blok. */
    toolsTitle: string
    toolsIntro: string
    toolLabel: string
    tools: UseTool[]
    /** Bir aracı ya da köprünün tamamını kapatmak. */
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
  popupLead: "Instagram'a kendisi istek göndermez. Siz gezerken sayfanın zaten indirdiği bilgiyi kaydeder.",
  popupTools: {
    posts: {
      title: 'Gönderi listesi',
      desc: 'Profilinizi açıp aşağı kaydırdığınızda gönderilerinizi tarih, beğeni ve yorum sayısıyla kaydeder.',
      stat: '50 gönderi bulundu',
      action: 'Profilimi aç',
    },
    likers: {
      title: 'Beğenenler',
      desc: 'Bir gönderinizin altındaki beğenme sayısına tıklayıp listeyi sonuna kadar kaydırdığınızda, beğenenleri kaydeder.',
      stat: '12 / 50 gönderi okundu',
      action: 'Sıradaki gönderiyi aç',
    },
    comments: {
      title: 'Yorumlar',
      desc: 'Bir gönderinizi açtığınızda yorum yapanları kendiliğinden kaydeder.',
      stat: '9 gönderinin yorumları kaydedildi',
    },
  },
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
  popupVersionValue: '2.3.0',
  popupNewVersionValue: '2.4.0',
  popupLastCheck: 'Son denetim',
  popupLastCheckValue: '14:30',
  popupUpToDate: 'Güncel',
  popupManual: 'Yeni sürüm var, elle kurulum gerekiyor',
  popupManualNote: 'Yeni sürüm var (2.4.0). Bu kopya kendiliğinden güncellenemiyor.',
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
        text: "ZIP kimin beğendiğini ve yorum yaptığını içermez. Bunun için Tarayıcı köprüsü eklentisini Chrome'a kur. Eklentinin üç ayrı aracı var: Gönderi listesi, Beğenenler ve Yorumlar. Hepsi, Instagram'da gezerken sayfanın zaten indirdiği bilgiyi kaydeder.",
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
    how: "Eklenti Instagram'a kendisi hiçbir istek göndermez, yalnızca dinler. Üç ayrı aracı var. Gönderi listesi: profilini açıp aşağı kaydırdığında gönderilerini kaydeder. Beğenenler: bir gönderinin altındaki \"X beğenme\" yazısına tıkladığında listeyi Instagram'ın sayfası kendisi indirir; eklenti bu zaten inmiş listeyi okur. Yorumlar: bir gönderini açtığında yorum yapanları kaydeder. Hepsi bilgisayarındaki uygulamaya gider.",
    rulesTitle: 'Bu ne anlama geliyor',
    rules: [
      'Zamanlayıcı, otomatik okuma ya da günlük sınır yok. Sen tıklamadıkça hiçbir şey olmaz.',
      "Instagram'ın gördüğü her şey senin kendi tıklamaların. Normal kullanımdan bir farkı yok.",
      "Eklenti hiçbir adrese kendisi gitmediği için, Instagram adreslerini değiştirse de çalışmaya devam eder.",
      'Yalnızca kendi gönderilerinin beğenenleri ve yorumları kaydedilir. Sayfanın yüklediği başka her şeyi uygulama yok sayar.',
      "Veriler yalnızca bilgisayarında durur. InstaAnalytic sunucusu Instagram'a hiç bağlanmaz.",
      'Eklenti sadece okur: takip etmez, beğenmez, mesaj atmaz.',
      'Her aracı ayrı ayrı kapatabilirsin. Kapalı araç hiçbir şey kaydetmez.',
      'Instagram bir uyarı gösterirse eklenti bunu fark eder ve seni uyarır. Ne yapman gerektiği hemen aşağıda.',
    ],
    warning: {
      title: 'Instagram bir uyarı gösterirse',
      intro: 'Bu kısmı mutlaka oku. Gezinirken Instagram şunlardan birini gösterebilir. Eklenti bunu sayfanın aldığı yanıtlardan fark eder:',
      signs: [
        '"Çok fazla istek" hatası (429)',
        '"Daha sonra tekrar dene" uyarısı',
        '"Bunun sen olduğunu doğrula" gibi bir doğrulama ekranı',
        "Instagram'ın seni giriş sayfasına atması",
      ],
      effectsTitle: 'Ne olur',
      effects: [
        'Uygulamada her sayfanın üstünde kırmızı bir şerit çıkar.',
        'Eklenti simgesinin üstünde kırmızı bir "!" belirir.',
        'Eklenti penceresindeki durum satırı kırmızıya döner.',
      ],
      doTitle: 'Sen ne yapmalısın',
      do: [
        'Beğenen listelerini açmayı bırak. En az 24 saat bekle. Bir hafta içinde yine olursa 72 saat bekle.',
        "Instagram'ı telefonundan her zamanki gibi kullan.",
        'Instagram bir doğrulama isterse onu kendin tamamla.',
        'Sonra daha yavaş ilerle: bir oturumda daha az gönderi, aralarda daha uzun mola.',
      ],
      never: 'Bu uyarıyı aşmaya çalışma. Eklentiyi silip yeniden kurma, başka bir tarayıcı, hesap ya da bilgisayar deneme. Bunlar hesabını daha büyük riske sokar.',
      alt: 'Uyarı sonrası görünüm: uygulamanın üstünde kırmızı bir şerit var, araç çubuğundaki eklenti simgesinde kırmızı bir ünlem işareti duruyor.',
      caption: 'Kırmızı şerit ve simgedeki "!": bir süre beğenen listesi açma.',
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
        text: 'Listede "InstaAnalytic Köprüsü" adında bir kart belirir. Solunda uygulamanın logosu, altında sürüm numarası yazar (ör. 2.3.0). Kartın sağ altındaki anahtar açık olmalı.',
        tip: 'Kartta kırmızı bir "Hatalar" düğmesi görürsen bir şey ters gitmiş demektir. Aşağıdaki "Kurulum çalışmadıysa" listesine bak.',
        alt: 'Uzantılar sayfasında InstaAnalytic Köprüsü 2.3.0 kartı işaretli; solunda uygulamanın logosu var. Yanında, kırmızı "Hatalar" düğmesinin bir sorun anlamına geldiği gösteriliyor.',
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
        tip: 'Eklenti kendi başına hiçbir şey okumaz. Araçlar sekmesindeki üç kart üç ayrı iş yapar: Gönderi listesi, Beğenenler ve Yorumlar. Nasıl kullanılacakları bir sonraki bölümde.',
        alt: 'Eklenti penceresi, Araçlar sekmesi açık. Araç çubuğundaki eklenti simgesi, pencerenin sağ üstündeki anahtar ve Ayarlar sekmesi sırayla işaretli. Altta Gönderi listesi, Beğenenler ve Yorumlar kartları duruyor; durum kutusunda yeşil nokta ve "Dinliyor." yazıyor.',
        caption: 'Simge, sağ üstteki anahtar, sonra Ayarlar sekmesinde profil.',
      },
      {
        art: 'connected',
        title: 'Bağlandığını kontrol et',
        text: 'Uygulamada Ayarlar ya da Gözden çıkar sayfasını aç. "Tarayıcı köprüsü" kartında yeşil bir nokta ve "Dinliyor" yazısını görürsen kurulum tamamdır.',
        tip: 'Görmezsen Instagram sekmesini bir kez yenile, sonra uygulama sayfasını da yenile.',
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
      extVersion: '2.3.0',
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
      scrollToEnd: 'Sona kadar kaydır',
      scrollList: 'En alta kadar kaydır',
      clickHere: 'tıkla',
      warnBanner: 'Instagram uyarı verdi. En az 24 saat beğenen listesi açma.',
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
        { text: 'Açık Instagram sekmesini bir kez yenile. Bu kadar.' },
      ],
      tip: 'Hemen bakmak istersen eklenti penceresinde Güncelleme sekmesini aç ve "Şimdi denetle"ye bas. İki sürüm aynıysa "Güncel" yazar.',
      alt: 'Eklenti penceresi, Güncelleme sekmesi açık. Yüklü sürüm 2.3.0, Uygulamadaki sürüm 2.3.0; durum satırında yeşil nokta ve "Güncel" yazıyor. Güncelleme sekmesi ve "Şimdi denetle" düğmesi sırayla işaretli.',
      caption: 'Güncelleme sekmesi: sürümler aynıysa "Güncel".',
      fixTitle: 'Eklentiyi zip dosyasından kurduysan (bir kez yapılır)',
      fixIntro: 'İndirilmiş bir zip kopyası kendiliğinden güncellenemez. Yeni sürüm çıkınca eklenti bunu fark eder: simgesinde turuncu bir "↑" belirir, Güncelleme sekmesinde "Yeni sürüm var (X). Bu kopya kendiliğinden güncellenemiyor." yazar. Uygulamadaki Tarayıcı köprüsü kartında da "Eklentin güncel değil" yazar. Şunu bir kez yap, sonraki güncellemeler kendiliğinden gelir:',
      fixSteps: [
        { text: 'chrome://extensions sayfasını aç. "InstaAnalytic Köprüsü" kartında "Kaldır"a bas. Kaydettiğin beğenenler uygulamada durur, silinmez. Instagram uyarısı sürüyorsa bunu yapma; önce bekleme süresi dolsun.' },
        { text: '"Paketlenmemiş öğe yükle"ye bas ve InstaAnalytic/frontend/extension klasörünü seç (içinde manifest.json olan).', link: { to: '#kurulum-1', label: 'Kurulum adımları' } },
        { text: 'Eklenti penceresini aç. Sağ üstteki anahtarı aç, Ayarlar sekmesinde profilini kontrol et.' },
        { text: 'Açık Instagram sekmesini bir kez yenile. İndirdiğin eski klasörü artık silebilirsin.' },
      ],
      fixAlt: 'Eklenti penceresi, Güncelleme sekmesi açık. Araç çubuğundaki eklenti simgesinde turuncu bir "↑" var. Pencerenin durum satırında turuncu nokta ve "Yeni sürüm var, elle kurulum gerekiyor" yazıyor; altında "Bu kopya kendiliğinden güncellenemiyor." notu var. Simge ve durum satırı sırayla işaretli.',
      fixCaption: 'Turuncu "↑": bu kopya bir kez uygulama klasöründen yeniden yüklenmeli.',
    },
  },

  use: {
    intro: "Eklenti üç ayrı iş yapar. Her biri eklenti penceresinin Araçlar sekmesinde kendi kartında durur: Gönderi listesi, Beğenenler ve Yorumlar. Hiçbiri kendi başına çalışmaz. Sen Instagram'da gezerken, sayfanın zaten indirdiği bilgiyi kaydeder.",
    stepsTitle: 'Önce: pencereyi aç',
    steps: [
      {
        art: 'useToggle',
        title: 'Eklenti penceresini aç',
        text: 'Araç çubuğundaki eklenti simgesine tıkla. Sağ üstteki anahtar açık olsun. Araçlar sekmesinde üç kart görürsün; her biri ayrı bir iş. Altta durum kutusunda yeşil nokta ve "Dinliyor." yazar.',
        alt: 'Eklenti penceresi, Araçlar sekmesi açık. Sağ üstteki anahtar, altındaki üç araç kartı (Gönderi listesi, Beğenenler, Yorumlar) ve yeşil noktalı "Dinliyor." durumu sırayla işaretli.',
        caption: 'Sağ üstteki anahtar açık; altında üç ayrı araç.',
      },
    ],
    toolsTitle: 'Üç araç, üç ayrı iş',
    toolsIntro: 'Sırayla git: önce gönderi listesi, sonra beğenenler. Yorumlar kendiliğinden gelir.',
    toolLabel: 'Araç',
    tools: [
      {
        id: 'posts',
        title: 'Gönderi listesi',
        what: 'Gönderilerini tarih, beğeni ve yorum sayısıyla kaydeder. Beğenenler aracı bu listeye dayanır, o yüzden önce bunu yap.',
        steps: [
          {
            art: 'postsOpen',
            title: '"Profilimi aç"a bas',
            text: 'Eklenti penceresinde "Gönderi listesi" kartındaki "Profilimi aç"a bas. Instagram profilin yeni bir sekmede açılır. İstersen profilini kendin de açabilirsin.',
            alt: 'Eklenti penceresindeki Gönderi listesi kartı: simge, başlık, açıklama, küçük anahtar ve "50 gönderi bulundu" yazısı. Kartın sağ altındaki "Profilimi aç" düğmesi işaretli.',
            caption: '"Profilimi aç" profilini yeni sekmede açar.',
          },
          {
            art: 'useProfile',
            title: 'Sonuna kadar bir kez kaydır',
            text: 'Profilinde gönderilerinin sonuna gelene kadar aşağı kaydır. Kartta "N gönderi bulundu" yazar. Bunu bir kez yapman yeter. Yeni bir gönderi paylaşınca tekrarla.',
            alt: 'Instagram profil sayfası, gönderi kutucukları görünüyor. Sağda aşağı doğru bir ok ve "Sona kadar kaydır" yazısı işaretli. Altında eklentinin Gönderi listesi kartında "50 gönderi bulundu" yazısı işaretli.',
            caption: 'Sona kadar kaydır: "50 gönderi bulundu".',
          },
        ],
      },
      {
        id: 'likers',
        title: 'Beğenenler',
        what: 'Gönderilerini kimin beğendiğini kaydeder. Her gönderi için bir kez yapılır. Kartta kaç gönderinin okunduğu yazar.',
        steps: [
          {
            art: 'likersNext',
            title: '"Sıradaki gönderiyi aç"a bas',
            text: 'Eklenti penceresinde "Beğenenler" kartındaki "Sıradaki gönderiyi aç"a bas. Beğenenleri henüz okunmamış ilk gönderin yeni bir sekmede açılır.',
            alt: 'Eklenti penceresindeki Beğenenler kartı: ilerleme çubuğu ve "12 / 50 gönderi okundu" yazısı. Kartın sağ altındaki "Sıradaki gönderiyi aç" düğmesi işaretli.',
            caption: 'Okunmamış sıradaki gönderi yeni sekmede açılır.',
          },
          {
            art: 'useLikes',
            title: 'Beğenme sayısına tıkla, listeyi sona kadar kaydır',
            text: 'Gönderide fotoğrafın altındaki "X beğenme" yazısına tıkla (bazı hesaplarda "beğenenler" yazar). Bir liste açılır. Listeyi en alta kadar kaydır ki tamamı yüklensin.',
            tip: 'Instagram uzun listeleri parça parça yükler. En alta inmezsen yalnızca ilk kısım kaydedilir.',
            alt: 'Açık bir Instagram gönderisi. Fotoğrafın altındaki "214 beğenme" yazısı işaretli. Yanında açılan Beğenmeler listesi ve altındaki "En alta kadar kaydır" yazısı işaretli.',
            caption: '"214 beğenme"ye tıkla, listeyi en alta kadar kaydır.',
          },
          {
            art: 'likersProgress',
            title: 'Kapat ve tekrarla',
            text: 'Listeyi ve sekmeyi kapat. Kartta çubuk biraz dolar, okunan gönderi sayısı bir artar. Sonra yine "Sıradaki gönderiyi aç"a bas. Hepsi bitince düğmede "Hepsi okundu" yazar.',
            alt: 'Eklenti penceresindeki Beğenenler kartı. Önce ilerleme çubuğu, sonra "Sıradaki gönderiyi aç" düğmesi işaretli.',
            caption: 'Çubuk dolar; sıradaki gönderiye geç.',
          },
        ],
        tip: { title: 'Acele etme', text: 'Bir oturumda 5–10 gönderi yeter. Gerisini birkaç güne yay. Bunu normal bir insan hızında yapmak işin bütün amacı.' },
      },
      {
        id: 'comments',
        title: 'Yorumlar',
        what: 'Gönderilerine kimin yorum yaptığını kaydeder. Ayrıca bir şey yapman gerekmez.',
        steps: [
          {
            art: 'comments',
            title: 'Bir gönderini aç, yeter',
            text: 'Kendi gönderilerinden birini aç. Yorumlar sayfayla birlikte zaten yüklenir; eklenti yorum yapanları kendiliğinden kaydeder. Beğenenler için gönderi açtığında yorumlar da kaydedilir.',
            alt: 'Açık bir Instagram gönderisi. Sağdaki yorumlar işaretli. Yanında eklentinin Yorumlar kartında "9 gönderinin yorumları kaydedildi" yazısı işaretli.',
            caption: 'Gönderiyi açınca yorum yapanlar kaydedilir.',
          },
        ],
      },
    ],
    off: {
      title: 'Bir aracı kapatmak',
      text: 'Her kartın kendi küçük anahtarı var. Kapattığın araç soluk görünür ve hiçbir şey kaydetmez; uygulama yalnızca açık araçların verisini saklar. Örneğin yorumları istemiyorsan Yorumlar\'ı kapat. Sağ üstteki büyük anahtar hepsini birden kapatır. O zaman durum kutusunda "Köprü kapalı. Sağ üstteki anahtarla açın." yazar.',
      alt: 'Eklenti penceresi, Araçlar sekmesi. Yorumlar kartı kapalı ve soluk; kartın küçük anahtarı işaretli. Sağ üstteki büyük anahtar ikinci olarak işaretli.',
      caption: 'Kapalı araç soluk görünür ve hiçbir şey kaydetmez.',
    },
    troubleTitle: 'Kayıt olmuyorsa',
    trouble: [
      {
        term: 'Gönderi listesi kartında "Henüz gönderi yok" yazıyor.',
        text: '"Profilimi aç"a bas ve gönderilerinin sonuna kadar aşağı kaydır. Sağ üstteki anahtar ve kartın kendi anahtarı açık olmalı. Kurulumdan ya da güncellemeden sonra Instagram sekmesini bir kez yenile.',
      },
      {
        term: 'Beğenenler kartında "Önce gönderi listesi gerekli" yazıyor.',
        text: 'Beğenenler aracı gönderi listene dayanır. Önce Gönderi listesi adımlarını yap.',
      },
      {
        term: 'Beğenenler kaydedilmiyor.',
        text: '"Sıradaki gönderiyi aç"a bas, sonra fotoğrafın altındaki "X beğenme" yazısına tıkla. Beğenenler kartının anahtarı açık olmalı. Kurulumdan ya da güncellemeden sonra Instagram sekmesini bir kez yenile.',
      },
      { term: 'Bazı beğenenler eksik.', text: 'Liste en alta kadar kaydırılmamış. Gönderiyi yeniden aç, beğenenler listesini aç ve en alta kadar kaydır.' },
      { term: 'Yorumlar kaydedilmiyor.', text: 'Yorumlar kartının anahtarı açık mı, bak. Kapalı bir araç hiçbir şey kaydetmez.' },
      {
        term: "Kartta \"Instagram'da @… açık\" yazıyor.",
        text: "Chrome'da başka bir Instagram hesabı açık. O hesapta gezinirken hiçbir şey kaydedilmez. Instagram'da bu profilin hesabına geç ya da eklenti penceresinden doğru profili seç.",
      },
      { term: 'Başkasının gönderisini açtım, kaydedilmedi.', text: 'Bilerek böyle. Yalnızca kendi gönderilerinin beğenenleri ve yorumları kaydedilir.' },
    ],
    afterTitle: 'Sonrası',
    after: 'Kaç gönderinin okunduğunu eklenti penceresindeki Beğenenler kartında görürsün. Uygulamada da köprü kartında ve Gönderiler sayfasında yazar. Yeni bir gönderi paylaştığında "Profilimi aç" ile profilini bir kez aç, sonra "Sıradaki gönderiyi aç". Bir gönderiye sonradan beğeni geldiyse listesini birkaç gün sonra yeniden açabilirsin.',
    limitTitle: 'Açık konuşalım',
    limit: "Bu yöntem riski çok azaltır ama sıfırlamaz. Hiçbir araç sıfır risk garanti edemez. Eklenti Instagram'a istek göndermez, ama beğenen listelerini art arda ve çok hızlı açmak normal kullanım gibi görünmez. Kendi hızında, sakin ilerle.",
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
        text: 'Gönderilerin ve hangilerinin beğenen listesinin okunduğu.',
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
      { term: 'Beğeni kaydetme', text: "Eklenti Instagram'a hiç istek göndermez. Senin açtığın sayfanın zaten indirdiği listeyi okur. Sunucu Instagram'a bağlanmaz." },
      { term: 'Ne zaman kaydeder', text: 'Yalnızca sen kendi profilini, gönderini ya da beğenenler listesini açtığında. Zamanlayıcı, otomatik okuma ve günlük sınır yok; hız senin hızın.' },
      { term: 'Ne kaydedilmez', text: 'Başkalarının gönderileri, kapattığın araçların verisi ve sayfanın yüklediği başka her şey. Uygulama bunları yok sayar.' },
      { term: 'Hayalet kontrolü', text: 'Oturumsuz, çerezsiz bir tarayıcıyla yapılır. Hesabınla bağlantısı yok.' },
      {
        term: 'Uyarı gelirse',
        text: 'Uygulamada kırmızı bir şerit, eklenti simgesinde kırmızı "!" çıkar. En az 24 saat (bir hafta içinde tekrarlarsa 72 saat) beğenen listesi açma. Takip/çıkış işlemleri 6 saat durur ve kuyruk boşaltılır.',
        link: { to: '#uyari', label: 'Ne yapmalı' },
      },
      { term: 'Takip / takipten çıkma', text: 'Varsayılan olarak kapalı. Açılsa bile saatte en fazla 15, günde en fazla 60 işlem; iki işlem arasında en az 60 saniye.' },
      { term: 'Verilerin', text: 'Yalnızca kendi bilgisayarında durur. Ayarlar sayfasındaki "Tüm verimi sil" ile hepsini silebilirsin.', link: { to: '/settings', label: 'Ayarlar' } },
    ],
    riskTitle: 'Risk profili neyi değiştirir',
    risk: "Ayarlar'da üç profil var: Güvenli, Dengeli, Agresif. Profil, uygulamanın kendi yaptığı takip ve takipten çıkma işlemlerinin beklemelerini ve sınırlarını belirler. Köprüyü etkilemez; köprüde hız senin tıklama hızın. Çoğu kişi için Güvenli yeterli. Agresif'te uyarı alma ihtimali belirgin şekilde artar.",
    limitsTitle: 'Bilinen sınırlar',
    limits: [
      'Instagram eşiklerini açıklamaz. Buradaki sayılar tahmindir.',
      'Hiçbir ayar "hesabım kısıtlanmaz" garantisi vermez. Ayarlar sadece riski düşürür.',
      'Eklenti Instagram adreslerine bağlı değil. Ama sayfanın indirdiği verinin biçimi çok değişirse listeyi tanıyamayabilir; o zaman eklentinin yeni bir sürümü gerekir. Uygulamayı güncellediğinde eklenti de kendiliğinden güncellenir.',
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
        text: 'En az 10 gönderinin beğenenleri okunmuş olmalı. Köprü eklentisini kur ve birkaç gün içinde gönderilerini tek tek aç.',
        link: { to: '#kullanim', label: 'Nasıl' },
      },
      {
        term: 'Eklenti hiçbir şey kaydetmiyor.',
        text: 'Eklenti kendi kendine okumaz. Sen Instagram\'da gezerken kaydeder. Sağ üstteki anahtar ve o aracın kendi anahtarı açık mı, profil doğru mu? Kurulumdan ya da güncellemeden sonra Instagram sekmesini yeniledin mi? Eklenti penceresindeki durum kutusu ne olduğunu yazar.',
        link: { to: '#kullanim', label: 'Kullanım' },
      },
      {
        term: 'Simgede kırmızı "!" var, uygulamada kırmızı şerit çıktı.',
        text: "Instagram bir uyarı göstermiş. En az 24 saat (bir hafta içinde tekrarlarsa 72 saat) beğenen listesi açma. Instagram'ı telefonundan normal kullan, istenirse doğrulamayı kendin yap.",
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
        title: '4. Eklentinin üç aracı',
        items: [
          'Gönderi listesi: "Profilimi aç"a bas, profilini sonuna kadar bir kez kaydır',
          'Gönderi listesi kartında "N gönderi bulundu" yazıyor',
          'Beğenenler: "Sıradaki gönderiyi aç"a bas',
          'Gönderide "X beğenme" yazısına tıkla, listeyi en alta kadar kaydır, sonra kapat',
          'Çubuk doldu; tekrarla. Bir oturumda 5–10 gönderi, gerisini birkaç güne yay',
          'Yorumlar: ayrıca bir şey yapma; gönderiyi açınca yorum yapanlar kaydedilir',
          'İstemediğin aracı kendi anahtarıyla kapat; kapalı araç hiçbir şey kaydetmez',
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
          '"Eklenti X sürümüne güncellendi" yazınca açık Instagram sekmesini bir kez yenile',
          'Zip kopyasından kurduysan ve "elle kurulum gerekiyor" yazıyorsa (bir kez): chrome://extensions → eski kartta Kaldır',
          'Sonra Paketlenmemiş öğe yükle → InstaAnalytic/frontend/extension klasörünü seç',
        ],
      },
      {
        title: 'Instagram uyarı verirse',
        items: [
          'Beğenen listelerini açmayı bırak',
          'En az 24 saat bekle (bir hafta içinde tekrarlarsa 72 saat)',
          "Instagram'ı telefonundan normal kullan",
          'Doğrulama istenirse kendin tamamla',
          'Sonra daha yavaş ilerle',
          'Uyarıyı aşmaya çalışma',
        ],
      },
    ],
    footer: "Hatırlatma: hiçbir araç sıfır risk garanti edemez. Eklenti Instagram'a kendisi istek göndermez; yine de acele etme. Instagram bir uyarı gösterirse dur ve bekle.",
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
        text: 'The ZIP does not say who liked or commented on your posts. For that, install the Browser bridge extension in Chrome. It has three separate tools: Gönderi listesi (post list), Beğenenler (likers) and Yorumlar (comments). Each one saves what the page has already downloaded while you browse Instagram.',
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
    how: 'The extension never sends a request to Instagram itself. It only listens. It has three separate tools. Gönderi listesi (post list): saves your posts when you open your profile and scroll down. Beğenenler (likers): when you click the "X likes" count under a post, Instagram\'s page downloads the list by itself; the extension reads that list, already downloaded. Yorumlar (comments): saves the commenters when you open one of your posts. Everything goes to the app on your computer.',
    rulesTitle: 'What this means',
    rules: [
      'No timers, no automatic reading, no daily cap. Nothing happens unless you click.',
      'Everything Instagram sees is your own clicks. It looks no different from normal use.',
      'It keeps working even if Instagram changes its addresses, because the extension never visits any address itself.',
      'Only the likers and comments of your own posts are saved. The app ignores anything else the page loads.',
      'The data stays on your computer. The InstaAnalytic server never connects to Instagram.',
      'It only reads: it never follows, likes or sends messages.',
      'You can turn each tool off on its own. A tool that is off saves nothing.',
      'If Instagram shows a warning, the extension notices and tells you. What to do is right below.',
    ],
    warning: {
      title: 'If Instagram shows a warning',
      intro: 'Please read this part. While you browse, Instagram may show one of these. The extension notices it in the responses the page gets:',
      signs: [
        'A "Too many requests" error (429)',
        'A "Try again later" warning',
        'A verification screen such as "Confirm it\'s you"',
        'Instagram sending you to the login page',
      ],
      effectsTitle: 'What happens',
      effects: [
        'A red banner appears at the top of every page in the app.',
        'The extension icon shows a red "!" badge.',
        'The status line in the extension popup turns red.',
      ],
      doTitle: 'What you should do',
      do: [
        'Stop opening likers lists. Wait at least 24 hours. If it happens again within a week, wait 72 hours.',
        'Use Instagram from your phone as you normally would.',
        'If Instagram asks for verification, complete it yourself.',
        'Afterwards, go slower: fewer posts per sitting, longer breaks in between.',
      ],
      never: 'Never try to get around the warning. Do not remove and reinstall the extension, and do not try another browser, account or computer. That puts your account at greater risk.',
      alt: 'What it looks like after a warning: a red banner across the top of the app and a red exclamation mark on the extension icon in the toolbar.',
      caption: 'Red banner and a "!" on the icon: stop opening likers lists for a while.',
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
        text: 'A card named "InstaAnalytic Köprüsü" appears in the list, with the app logo on its left and a version number under it (for example 2.3.0). The switch at the bottom right of the card should be on.',
        tip: 'If the card shows a red "Errors" button, something went wrong. See "If the install did not work" below.',
        alt: 'The InstaAnalytic Köprüsü 2.3.0 card on the Extensions page is marked, with the app logo on its left. Next to it, a red "Errors" button is shown as a sign of trouble.',
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
        tip: 'The extension reads nothing on its own. The three cards on the Araçlar tab do three separate jobs: Gönderi listesi (post list), Beğenenler (likers) and Yorumlar (comments). The next section shows how to use them.',
        alt: 'The extension popup with the Araçlar tab open. The extension icon in the toolbar, the switch at the top right of the popup and the Ayarlar tab are marked in order. Below are the Gönderi listesi, Beğenenler and Yorumlar cards; the status box shows a green dot and "Dinliyor.".',
        caption: 'Icon, the switch at the top right, then your profile on the Ayarlar tab.',
      },
      {
        art: 'connected',
        title: 'Check that it is connected',
        text: 'In the app, open Settings or Cleanup. If the "Browser bridge" card shows a green dot and "Listening", you are done.',
        tip: 'If you do not see it, reload the Instagram tab once, then reload the app page too.',
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
      extVersion: '2.3.0',
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
      scrollToEnd: 'Scroll to the end',
      scrollList: 'Scroll to the bottom',
      clickHere: 'click',
      warnBanner: 'Instagram showed a warning. Do not open likers lists for 24 hours.',
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
        { text: 'Reload the open Instagram tab once. That is all.' },
      ],
      tip: 'To check right away, open the Güncelleme tab in the popup and press "Şimdi denetle" (check now). If both versions match, it says "Güncel" (up to date).',
      alt: 'The extension popup with the Güncelleme tab open. Yüklü sürüm (installed) 2.3.0, Uygulamadaki sürüm (in the app) 2.3.0; the status line shows a green dot and "Güncel". The Güncelleme tab and the "Şimdi denetle" button are marked in order.',
      caption: 'The Güncelleme tab: matching versions mean "Güncel".',
      fixTitle: 'If you installed it from a zip file (done once)',
      fixIntro: 'A downloaded zip copy cannot update itself. When a new version comes out, the extension notices: an orange "↑" appears on its icon, and the Güncelleme tab says "Yeni sürüm var (X). Bu kopya kendiliğinden güncellenemiyor." (a new version exists; this copy cannot update itself). The Browser bridge card in the app also says your extension is out of date. Do this once, and later updates arrive on their own:',
      fixSteps: [
        { text: 'Open chrome://extensions. On the "InstaAnalytic Köprüsü" card, press "Remove". The likers you saved stay in the app; nothing is deleted. Do not do this while an Instagram warning is active; wait until it is over.' },
        { text: 'Press "Load unpacked" and pick the InstaAnalytic/frontend/extension folder (the one with manifest.json).', link: { to: '#kurulum-1', label: 'Install steps' } },
        { text: 'Open the popup. Turn on the switch at the top right and check your profile on the Ayarlar (settings) tab.' },
        { text: 'Reload the open Instagram tab once. You can delete the old downloaded folder now.' },
      ],
      fixAlt: 'The extension popup with the Güncelleme tab open. The extension icon in the toolbar has an orange "↑". The status line shows an orange dot and "Yeni sürüm var, elle kurulum gerekiyor", with the note "Bu kopya kendiliğinden güncellenemiyor." under it. The icon and the status line are marked in order.',
      fixCaption: 'Orange "↑": load this copy once more from the app folder.',
    },
  },

  use: {
    intro: 'The extension does three separate jobs. Each one has its own card on the Araçlar (tools) tab of the extension popup: Gönderi listesi (post list), Beğenenler (likers) and Yorumlar (comments). None of them runs on its own. While you browse Instagram, they save what the page has already downloaded.',
    stepsTitle: 'First: open the popup',
    steps: [
      {
        art: 'useToggle',
        title: 'Open the extension popup',
        text: 'Click the extension icon in the toolbar. The switch at the top right should be on. The Araçlar tab shows three cards; each one is a separate job. At the bottom, the status box shows a green dot and "Dinliyor." (listening).',
        alt: 'The extension popup with the Araçlar tab open. The switch at the top right, the three tool cards below it (Gönderi listesi, Beğenenler, Yorumlar) and the status "Dinliyor." with a green dot are marked in order.',
        caption: 'Switch at the top right on; three separate tools below.',
      },
    ],
    toolsTitle: 'Three tools, three separate jobs',
    toolsIntro: 'Go in order: the post list first, then the likers. Comments arrive on their own.',
    toolLabel: 'Tool',
    tools: [
      {
        id: 'posts',
        title: 'Gönderi listesi (post list)',
        what: 'Saves your posts with their date, likes and comments count. The likers tool works from this list, so do this first.',
        steps: [
          {
            art: 'postsOpen',
            title: 'Press "Profilimi aç" (open my profile)',
            text: 'In the popup, press "Profilimi aç" on the "Gönderi listesi" card. Your Instagram profile opens in a new tab. You can also open your profile yourself.',
            alt: 'The Gönderi listesi card in the extension popup: icon, title, description, small switch and "50 gönderi bulundu" (50 posts found). The "Profilimi aç" button at the bottom right of the card is marked.',
            caption: '"Profilimi aç" opens your profile in a new tab.',
          },
          {
            art: 'useProfile',
            title: 'Scroll to the end once',
            text: 'On your profile, scroll down until you reach the end of your posts. The card then shows "N gönderi bulundu" (N posts found). Doing this once is enough. Repeat it when you share a new post.',
            alt: 'An Instagram profile page with a grid of posts. On the right, a downward arrow and "Scroll to the end" are marked. Below it, the extension\'s Gönderi listesi card showing "50 gönderi bulundu" is marked.',
            caption: 'Scroll to the end: "50 gönderi bulundu".',
          },
        ],
      },
      {
        id: 'likers',
        title: 'Beğenenler (likers)',
        what: 'Saves who liked your posts. You do it once per post. The card shows how many posts are read.',
        steps: [
          {
            art: 'likersNext',
            title: 'Press "Sıradaki gönderiyi aç" (open the next post)',
            text: 'In the popup, press "Sıradaki gönderiyi aç" on the "Beğenenler" card. Your first post whose likers are not read yet opens in a new tab.',
            alt: 'The Beğenenler card in the extension popup: a progress bar and "12 / 50 gönderi okundu" (12 of 50 posts read). The "Sıradaki gönderiyi aç" button at the bottom right of the card is marked.',
            caption: 'The next unread post opens in a new tab.',
          },
          {
            art: 'useLikes',
            title: 'Click the likes count, scroll the list to the end',
            text: 'On the post, click the "X likes" text under the photo (on some accounts it says "liked by"). A list opens. Scroll it to the bottom so the whole list loads.',
            tip: 'Instagram loads long lists piece by piece. If you do not reach the bottom, only the first part is saved.',
            alt: 'An open Instagram post. The "214 likes" text under the photo is marked. Next to it, the Likes list that opened and "Scroll to the bottom" under it are marked.',
            caption: 'Click "214 likes", scroll the list to the bottom.',
          },
          {
            art: 'likersProgress',
            title: 'Close it and repeat',
            text: 'Close the list and the tab. On the card the bar fills a little and the count of read posts goes up by one. Then press "Sıradaki gönderiyi aç" again. When all are done, the button says "Hepsi okundu" (all read).',
            alt: 'The Beğenenler card in the extension popup. The progress bar is marked first, then the "Sıradaki gönderiyi aç" button.',
            caption: 'The bar fills; go to the next post.',
          },
        ],
        tip: { title: 'No rush', text: '5–10 posts a sitting is plenty. Spread the rest over a few days. Doing it at a normal human pace is the whole point.' },
      },
      {
        id: 'comments',
        title: 'Yorumlar (comments)',
        what: 'Saves who commented on your posts. There is nothing extra to do.',
        steps: [
          {
            art: 'comments',
            title: 'Open one of your posts, that is all',
            text: 'Open one of your own posts. The comments load with the page anyway; the extension saves the commenters on its own. When you open a post for its likers, its comments are saved too.',
            alt: 'An open Instagram post. The comments on the right are marked. Next to it, the extension\'s Yorumlar card showing "9 gönderinin yorumları kaydedildi" (comments saved for 9 posts) is marked.',
            caption: 'Opening a post saves its commenters.',
          },
        ],
      },
    ],
    off: {
      title: 'Turning a tool off',
      text: 'Each card has its own small switch. A tool you turn off is dimmed and saves nothing; the app only stores data from the tools that are on. For example, if you do not want comments, turn off Yorumlar. The big switch at the top right turns everything off at once. The status box then says "Köprü kapalı. Sağ üstteki anahtarla açın." (the bridge is off; turn it on with the switch at the top right).',
      alt: 'The extension popup, Araçlar tab. The Yorumlar card is off and dimmed; its small switch is marked. The big switch at the top right is marked second.',
      caption: 'A tool that is off is dimmed and saves nothing.',
    },
    troubleTitle: 'If nothing is saved',
    trouble: [
      {
        term: 'The Gönderi listesi card says "Henüz gönderi yok" (no posts yet).',
        text: 'Press "Profilimi aç" and scroll down to the end of your posts. The switch at the top right and the card\'s own switch must be on. After installing or updating, reload the Instagram tab once.',
      },
      {
        term: 'The Beğenenler card says "Önce gönderi listesi gerekli" (post list needed first).',
        text: 'The likers tool works from your post list. Do the Gönderi listesi steps first.',
      },
      {
        term: 'Likers are not saved.',
        text: 'Press "Sıradaki gönderiyi aç", then click the "X likes" text under the photo. The Beğenenler card\'s switch must be on. After installing or updating, reload the Instagram tab once.',
      },
      { term: 'Some likers are missing.', text: 'The list was not scrolled to the bottom. Open the post again, open the likes list and scroll all the way down.' },
      { term: 'Comments are not saved.', text: 'Check that the Yorumlar card\'s switch is on. A tool that is off saves nothing.' },
      {
        term: 'The card says another @account is open on Instagram.',
        text: 'A different Instagram account is logged in in Chrome. Nothing is saved while you browse with it. Switch to this profile\'s account on Instagram, or pick the right profile in the popup.',
      },
      { term: 'I opened someone else\'s post and nothing was saved.', text: 'That is on purpose. Only the likers and comments of your own posts are saved.' },
    ],
    afterTitle: 'After that',
    after: 'The Beğenenler card in the popup shows how many posts are read. The bridge card and the Posts page in the app show it too. When you share a new post, open your profile once with "Profilimi aç", then press "Sıradaki gönderiyi aç". If a post gets more likes later, you can open its list again a few days later.',
    limitTitle: 'To be clear',
    limit: 'This lowers the risk a lot but not to zero. No tool can promise zero risk. The extension sends no requests to Instagram, but opening likers lists one after another very quickly does not look like normal use. Go at your own calm pace.',
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
      { term: 'Posts', text: 'Your posts and which of them have their likers list read.', link: { to: '/posts', label: 'Open' } },
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
      { term: 'Saving likes', text: 'The extension sends no requests to Instagram at all. It reads the list the page you opened has already downloaded. The server does not connect to Instagram.' },
      { term: 'When it saves', text: 'Only when you open your own profile, post or likes list. No timers, no automatic reading, no daily cap; the pace is your pace.' },
      { term: 'What is not saved', text: 'Other people\'s posts, data from tools you turned off, and anything else the page loads. The app ignores them.' },
      { term: 'Ghost check', text: 'Done in a browser with no login and no cookies. Not linked to your account.' },
      {
        term: 'If a warning appears',
        text: 'A red banner appears in the app and a red "!" on the extension icon. Do not open likers lists for at least 24 hours (72 if it happens again within a week). Follow/unfollow actions stop for 6 hours and the queue is cleared.',
        link: { to: '#uyari', label: 'What to do' },
      },
      { term: 'Follow / unfollow', text: 'Off by default. Even when on: at most 15 an hour, 60 a day, at least 60 seconds apart.' },
      { term: 'Your data', text: 'Stays on your computer. "Delete all my data" on the Settings page removes everything.', link: { to: '/settings', label: 'Settings' } },
    ],
    riskTitle: 'What the risk profile changes',
    risk: "Settings has three profiles: Safe, Balanced, Aggressive. The profile sets the waits and limits for the app's own follow and unfollow actions. It does not affect the bridge; there, the pace is your clicking pace. Safe is enough for most people. Aggressive makes a warning noticeably more likely.",
    limitsTitle: 'Known limits',
    limits: [
      'Instagram does not publish its thresholds. The numbers here are estimates.',
      'No setting guarantees your account will not be restricted. Settings only lower the risk.',
      'The extension does not depend on Instagram\'s addresses. But if the format of the data the page downloads changes a lot, it may not recognise the list; then a new version of the extension is needed. When you update the app, the extension updates itself too.',
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
        text: 'The likers of at least 10 posts must be read. Install the bridge extension and open your posts one by one over a few days.',
        link: { to: '#kullanim', label: 'How' },
      },
      {
        term: 'The extension saves nothing.',
        text: 'The extension does not read on its own. It saves while you browse Instagram. Are the switch at the top right and that tool\'s own switch on, and is the profile right? Did you reload the Instagram tab after installing or updating? The status box in the extension popup says what is going on.',
        link: { to: '#kullanim', label: 'Using it' },
      },
      {
        term: 'The icon has a red "!" and the app shows a red banner.',
        text: 'Instagram showed a warning. Do not open likers lists for at least 24 hours (72 if it happens again within a week). Use Instagram normally from your phone and complete any verification yourself.',
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
        title: '4. The three tools of the extension',
        items: [
          'Gönderi listesi (post list): press "Profilimi aç", scroll your profile to the end once',
          'The Gönderi listesi card shows "N gönderi bulundu" (N posts found)',
          'Beğenenler (likers): press "Sıradaki gönderiyi aç" (open the next post)',
          'On the post, click the "X likes" text, scroll the list to the bottom, then close it',
          'The bar fills; repeat. 5–10 posts a sitting, spread the rest over a few days',
          'Yorumlar (comments): nothing extra; opening a post saves its commenters',
          'Turn off a tool you do not want with its own switch; a tool that is off saves nothing',
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
          'When it says "Eklenti X sürümüne güncellendi", reload the open Instagram tab once',
          'If you installed from a zip copy and it says manual install is needed (once): chrome://extensions → Remove on the old card',
          'Then Load unpacked → pick the InstaAnalytic/frontend/extension folder',
        ],
      },
      {
        title: 'If Instagram shows a warning',
        items: [
          'Stop opening likers lists',
          'Wait at least 24 hours (72 if it happens again within a week)',
          'Use Instagram normally from your phone',
          'Complete any verification yourself',
          'Go slower afterwards',
          'Do not try to get around the warning',
        ],
      },
    ],
    footer: 'Reminder: no tool can promise zero risk. The extension sends no requests to Instagram itself; still, do not rush. If Instagram shows a warning, stop and wait.',
  },
}

const CONTENT: Record<GuideLang, GuideContent> = { tr, en }

export const guideContent = (lang: string): GuideContent => CONTENT[lang === 'en' ? 'en' : 'tr']
