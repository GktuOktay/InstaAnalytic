// Kullanım rehberinin bütün metni. Sayfa (GuidePage) ve indirilebilir kontrol listesi buradan beslenir.
// Bir şey değişirse (sınırlar, menü adları) yalnızca burayı güncellemek yeter.

export type GuideLang = 'tr' | 'en'

/** `to` uygulama içi rota ("/settings") ya da sayfa içi çapa ("#files") olabilir. */
export interface GuideLink { to: string; label: string }
export interface GuideStep { title?: string; text: string; link?: GuideLink }
export interface GuideRow { term: string; text: string; link?: GuideLink }

/** Kurulum resimlerinin kimlikleri. Her biri src/guide/illustrations.tsx içinde çizilir. */
export type ArtId =
  | 'download' | 'unzip' | 'address' | 'devmode' | 'loadUnpacked' | 'pickFolder'
  | 'card' | 'pin' | 'reload' | 'popup' | 'connected'

/** Resimli kurulum adımı. `alt` ekran okuyucu için resmin tarifi, `caption` resmin altındaki kısa yazı. */
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
  zipName: string
  folderName: string
  appTab: string
  guideHeading: string
  extCardTitle: string
  extCardText: string
  extButton: string
  samplesTitle: string
  downloads: string
  desktop: string
  documents: string
  doubleClick: string
  winHint: string
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
  notThis: string
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
  popupToggle: string
  popupNote: string
  popupStatus: string
  popupToday: string
  popupTodayValue: string
  popupLast: string
  popupNext: string
  popupProfile: string
  popupProfileValue: string
  popupProfileOption: string
  popupChange: string
  popupTryNow: string
  popupOpenApp: string
  settingsHeading: string
  bridgeTitle: string
  bridgeConnected: string
  bridgeDesc: string
  bridgeProgress: string
  bridgeStop: string
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

export type SectionId = 'start' | 'zip' | 'bridge' | 'results' | 'safety' | 'faq' | 'files'
export const SECTION_ORDER: SectionId[] = ['start', 'zip', 'bridge', 'results', 'safety', 'faq', 'files']

/** Sayfa içi çapa adları. Diğer sayfalar /guide#kopru ve /guide#referans adreslerine bağlanıyor; değiştirme. */
export const SECTION_ANCHOR: Record<SectionId, string> = {
  start: 'baslarken', zip: 'zip', bridge: 'kopru', results: 'sonuclar', safety: 'guvenlik', faq: 'sss', files: 'referans',
}

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
    devAlt: string
    troubleTitle: string
    troubleIntro: string
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

const tr: GuideContent = {
  title: 'Kullanım rehberi',
  subtitle: 'İlk kez kuruyorsan buradan başla. Her bölüm birkaç dakikada okunur.',
  tocLabel: 'Bu sayfada',
  sections: {
    start: 'Başlarken',
    zip: 'Verini ekle (ZIP)',
    bridge: 'Beğenenleri topla',
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
        title: 'Beğenenleri topla (isteğe bağlı)',
        text: "Kimin beğenip yorum yaptığını görmek için Tarayıcı köprüsü eklentisini Chrome'a kur. ZIP bu bilgiyi içermez.",
        link: { to: '#kopru', label: 'Köprü eklentisi' },
      },
      {
        title: 'Sonuçlara bak',
        text: 'Takipçi Analizi, ZIP yüklendiği anda hazırdır. Gözden çıkar ve Takipçi Skoru için en az 10 gönderinin taranmış olması gerekir.',
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
    intro: 'Tarayıcı köprüsü bir Chrome eklentisi. Kendi gönderilerini kimin beğendiğini ve kimin yorum yaptığını toplar.',
    howTitle: 'Nasıl çalışır',
    how: "Eklenti, zaten giriş yapmış olduğun Instagram sekmesinin içinden okur. Yani istekler her günkü kullanımınla aynı cihazdan, aynı internet bağlantısından ve aynı oturumdan çıkar. InstaAnalytic sunucusu Instagram'a hiç bağlanmaz; eklenti topladığını yalnızca bilgisayarındaki uygulamaya iletir. Eklenti sadece okur: takip etmez, beğenmez, mesaj atmaz.",
    rulesTitle: 'Kendine koyduğu sınırlar',
    rules: [
      'Günün her saatinde çalışabilir. Ama yalnızca bir Instagram sekmesi açıkken ve sen bilgisayarın başındayken.',
      'İki gönderi arasında 25–80 saniye bekler. Birkaç gönderide bir uzun mola verir.',
      'Günde en fazla 12 gönderi okur (Güvenli). Dengeli profilde 20, Agresif profilde 30.',
      'Yeni bir gönderiyi beklemeden okur. İlk 3 gününde okuduğu bir gönderiyi, 3 günü dolunca bir kez daha okur. Böylece sonradan gelen beğeniler de sayılır.',
      "Instagram'dan herhangi bir uyarı gelirse her şeyi kendiliğinden durdurur. Ne yapman gerektiği hemen aşağıda.",
    ],
    warning: {
      title: 'Instagram bir uyarı gösterirse',
      intro: 'Bu kısmı mutlaka oku. Instagram şunlardan birini gösterirse eklenti toplamayı hemen durdurur:',
      signs: [
        '"Çok fazla istek" hatası (429)',
        '"feedback_required" ya da "Daha sonra tekrar dene" uyarısı',
        '"Bunun sen olduğunu doğrula" gibi bir doğrulama ekranı',
        "Instagram'ın seni giriş sayfasına atması",
      ],
      effectsTitle: 'Ne olur',
      effects: [
        'Toplama 24 saat durur. Bir hafta içinde yine olursa 72 saat durur.',
        'Uygulamada her sayfanın üstünde kırmızı bir şerit çıkar.',
        'Eklenti simgesinin üstünde kırmızı bir "!" belirir.',
      ],
      doTitle: 'Sen ne yapmalısın',
      do: [
        'Uygulamada ve eklentide hiçbir düğmeye basma. "Şimdi dene"ye de basma.',
        "Instagram'ı telefonundan her zamanki gibi kullan.",
        'Instagram bir doğrulama isterse onu kendin tamamla.',
        'Bekleme süresinin bitmesini bekle. Toplama sonra kendiliğinden devam eder.',
        "Ayarlar'da risk profilini Güvenli'ye almayı düşün.",
      ],
      never: 'Bu durdurmayı aşmaya çalışma. Eklentiyi silip yeniden kurma, başka bir tarayıcı ya da bilgisayar deneme. Bunlar hesabını daha büyük riske sokar.',
      alt: 'Uyarı sonrası görünüm: uygulamanın üstünde kırmızı bir şerit var, araç çubuğundaki eklenti simgesinde kırmızı bir ünlem işareti duruyor.',
      caption: 'Kırmızı şerit ve simgedeki "!" işareti: toplama durdu.',
    },
    installTitle: 'Kurulum, adım adım (yaklaşık 5 dakika)',
    installIntro: 'Her adımda neye tıklayacağın resimde renkli bir çerçeve ve numarayla gösteriliyor. Resimler Chrome\'un sadeleştirilmiş hâli; seninki biraz farklı görünebilir. Kurulum yalnızca bir kez yapılır.',
    install: [
      {
        art: 'download',
        title: 'Eklentiyi indir',
        text: 'Bu sayfanın en altındaki Referans dosyalar bölümüne in ve "Eklentiyi indir" düğmesine bas. instaanalytic-kopru.zip adında bir dosya iner.',
        link: { to: '#referans', label: 'Referans dosyalar' },
        alt: 'Kullanım rehberindeki Referans dosyalar bölümü. Köprü eklentisi kartının sağındaki "Eklentiyi indir" düğmesi işaretli.',
        caption: '"Eklentiyi indir" düğmesine bas.',
      },
      {
        art: 'unzip',
        title: 'ZIP dosyasını aç',
        text: 'İndirilenler klasörünü aç. instaanalytic-kopru.zip dosyasına çift tıkla. Yanında instaanalytic-kopru adında bir klasör belirir.',
        tip: 'Windows\'ta: dosyaya sağ tıkla, "Tümünü ayıkla"yı seç, sonra "Ayıkla"ya bas. Çıkan klasörü silme ve başka yere taşıma. Chrome eklentiyi o klasörden çalıştırır.',
        alt: 'İndirilenler klasörü. instaanalytic-kopru.zip dosyasına çift tıklanıyor, yanında instaanalytic-kopru klasörü beliriyor.',
        caption: 'Çift tıkla, yanında klasör çıksın.',
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
        title: 'instaanalytic-kopru klasörünü seç',
        text: 'Açılan pencerede İndirilenler\'e git. instaanalytic-kopru klasörüne bir kez tıkla, sonra "Seç"e bas.',
        tip: 'ZIP dosyasını ya da onun bulunduğu üst klasörü seçme. Doğru klasörün içinde manifest.json adında bir dosya vardır.',
        alt: 'Klasör seçme penceresi. instaanalytic-kopru klasörü seçili ve işaretli, zip dosyasının yanında "bu değil" yazıyor. Sağ alttaki "Seç" düğmesi işaretli.',
        caption: 'ZIP dosyasını değil, klasörü seç.',
      },
      {
        art: 'card',
        title: 'Eklentinin listede olduğunu gör',
        text: 'Listede "InstaAnalytic Köprüsü 1.0.0" adında bir kart belirir. Kartın sağ altındaki anahtar açık olmalı.',
        tip: 'Kartta kırmızı bir "Hatalar" düğmesi görürsen bir şey ters gitmiş demektir. Aşağıdaki "Kurulum çalışmadıysa" listesine bak.',
        alt: 'Uzantılar sayfasında InstaAnalytic Köprüsü 1.0.0 kartı işaretli. Yanında, kırmızı "Hatalar" düğmesinin bir sorun anlamına geldiği gösteriliyor.',
        caption: 'Kart göründüyse eklenti yüklendi.',
      },
      {
        art: 'pin',
        title: 'Eklentiyi araç çubuğuna sabitle',
        text: "Adres çubuğunun sağındaki yapboz parçası simgesine (Uzantılar) tıkla. Açılan listede InstaAnalytic Köprüsü'nün yanındaki raptiyeye bas. Eklentinin simgesi artık hep görünür.",
        alt: 'Chrome araç çubuğundaki yapboz parçası simgesi işaretli. Açılan Uzantılar listesinde InstaAnalytic Köprüsü satırındaki raptiye simgesi işaretli.',
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
        title: 'Eklentiyi aç ve izin ver',
        text: 'Araç çubuğundaki eklenti simgesine tıkla. Küçük bir pencere açılır. Profil satırında kendi profilini seç; çoğu zaman kendiliğinden seçili gelir. Sonra en üstteki "Beğenenleri toplamaya izin ver" anahtarını aç.',
        alt: 'Eklenti penceresi. Araç çubuğundaki eklenti simgesi, Profil satırı ve "Beğenenleri toplamaya izin ver" anahtarı sırayla işaretli.',
        caption: 'Simge, profil, sonra izin anahtarı.',
      },
      {
        art: 'connected',
        title: 'Bağlandığını kontrol et',
        text: 'Uygulamada Ayarlar ya da Gözden çıkar sayfasını aç. "Tarayıcı köprüsü" kartında yeşil bir nokta ve "Eklenti bağlı" yazısını görürsen kurulum tamamdır.',
        tip: 'Bağlanması bir iki dakika sürebilir. Görmezsen biraz bekle ve sayfayı yenile.',
        link: { to: '/settings', label: 'Ayarlar' },
        alt: 'Uygulamanın Ayarlar sayfasında Tarayıcı köprüsü kartı. Yeşil nokta ve "Eklenti bağlı" yazısı işaretli.',
        caption: 'Yeşil nokta: eklenti bağlı.',
      },
    ],
    ui: {
      zipName: 'instaanalytic-kopru.zip',
      folderName: 'instaanalytic-kopru',
      appTab: 'InstaAnalytic',
      guideHeading: 'Referans dosyalar',
      extCardTitle: 'Köprü eklentisi (.zip)',
      extCardText: 'Chrome eklentisinin klasörü.',
      extButton: 'Eklentiyi indir',
      samplesTitle: 'Örnek ZIP dosyaları',
      downloads: 'İndirilenler',
      desktop: 'Masaüstü',
      documents: 'Belgeler',
      doubleClick: 'çift tıkla',
      winHint: 'Windows: sağ tık → Tümünü ayıkla',
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
      notThis: 'bu değil',
      extName: 'InstaAnalytic Köprüsü',
      extVersion: '1.0.0',
      details: 'Ayrıntılar',
      remove: 'Kaldır',
      errors: 'Hatalar',
      errorsHint: 'Bu düğme çıkarsa sorun var',
      manageExtensions: 'Uzantıları yönet',
      reloadOr: 'ya da',
      reloadWin: 'Windows',
      reloadMac: 'Mac',
      popupToggle: 'Beğenenleri toplamaya izin ver',
      popupNote: 'Yalnızca Instagram bir sekmede açıkken çalışır.',
      popupStatus: "Instagram'dan okunuyor…",
      popupToday: 'Bugün',
      popupTodayValue: '3 istek',
      popupLast: 'Son istek',
      popupNext: 'Sonraki',
      popupProfile: 'Profil',
      popupProfileValue: '@kullanici_adin',
      popupProfileOption: '@kullanici_adin — bu hesap',
      popupChange: 'Değiştir',
      popupTryNow: 'Şimdi dene',
      popupOpenApp: 'Uygulamayı aç',
      settingsHeading: 'Ayarlar',
      bridgeTitle: 'Tarayıcı köprüsü',
      bridgeConnected: 'Eklenti bağlı',
      bridgeDesc: 'Beğenenleri kendi Chrome\'undan yavaşça okur.',
      bridgeProgress: '4 / 12 gönderi okundu',
      bridgeStop: 'Durdur',
      warnBanner: 'Instagram uyarı verdi. Toplama 24 saat durdu.',
    },
    copy: { button: 'Kopyala', done: 'Kopyalandı', failed: 'Kopyalanamadı. Elle yaz.' },
    stepLabel: 'Adım',
    devAlt: 'Geliştiriciysen: aynı klasör depoda frontend/extension altında da duruyor. 6. adımda doğrudan onu seçebilirsin.',
    troubleTitle: 'Kurulum çalışmadıysa',
    troubleIntro: 'En sık karşılaşılan durumlar ve çözümleri:',
    trouble: [
      { term: '"Paketlenmemiş öğe yükle" düğmesi yok.', text: 'Geliştirici modu kapalı. Uzantılar sayfasında sağ üstteki anahtarı aç.' },
      {
        term: '"Manifest dosyası eksik veya okunamıyor" hatası',
        text: 'Yanlış klasör seçildi. ZIP dosyasını ya da üst klasörü değil, içinde manifest.json olan instaanalytic-kopru klasörünü seç. Windows klasörü bir kat daha içine koymuş olabilir; o zaman bir kat içeri gir.',
      },
      { term: 'Eklenti "Instagram sekmesini bir kez yenileyin" diyor.', text: "Instagram sekmesi eklentiden önce açılmış. Sekmeyi bir kez yenile (F5, Mac'te Cmd+R)." },
      { term: 'Eklenti penceresi "Uygulama kapalı" diyor.', text: 'InstaAnalytic şu an çalışmıyor. Uygulamayı başlat. Eklenti birkaç dakika içinde kendiliğinden bağlanır.' },
      {
        term: "Kartta \"Instagram'da @… açık\" yazıyor.",
        text: "Chrome'da başka bir Instagram hesabı açık. Instagram'da bu profilin hesabına geç ya da eklenti penceresinden doğru profili seç.",
      },
      { term: 'Eklenti kartında kırmızı "Hatalar" düğmesi var.', text: 'Düğmeye bas ve mesajı oku. Çoğu zaman yanlış klasör seçilmiştir. Eklentiyi "Kaldır" ile sil ve doğru klasörle yeniden yükle.' },
      { term: 'Eklenti simgesi araç çubuğunda yok.', text: "Yapboz parçası simgesine tıkla ve InstaAnalytic Köprüsü'nün yanındaki raptiyeye bas." },
      {
        term: 'Kart hâlâ "Eklenti henüz bağlanmadı" diyor.',
        text: 'Eklenti penceresinde izin anahtarı açık mı, profil seçili mi? Bir Instagram sekmesi açık mı? Bir iki dakika bekle ve sayfayı yenile.',
      },
    ],
    afterTitle: 'Sonrası',
    after: "Instagram'ı her zamanki gibi kullan. Eklenti arka planda yavaş ilerler. 100 gönderilik bir hesapta, Güvenli profille hepsinin okunması yaklaşık 9 gün sürer. Kaç gönderinin tarandığını Gönderiler sayfasında görebilirsin.",
    limitTitle: 'Açık konuşalım',
    limit: "Bu yöntem riski çok azaltır ama sıfırlamaz. Hiçbir araç sıfır risk garanti edemez. Eklentinin kullandığı adresler Instagram'ın belgelenmemiş iç adresleri; Instagram bunları haber vermeden değiştirebilir. Öyle olursa toplama durur ve eklentinin güncellenmesi gerekir.",
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
        text: 'Gönderilerin ve hangilerinin beğeni/yorum bilgisinin toplandığı.',
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
    groupsNote: 'Bu sayfa, son taranan gönderilerde kimin beğeni ya da yorum bıraktığına bakar. Sonucun doğru olması için en az 10 gönderi taranmış ve takipçi listesi eksiksiz olmalı (ZIP\'te "Tüm zamanlar").',
    groups: [
      { term: 'Hayaletler', text: 'Silinmiş ya da dondurulmuş hesaplar. Takip etmenin bir anlamı kalmamış. Bırakması en kolay grup.' },
      { term: 'Sen takip ediyorsun, o etmiyor, hiç etkileşimi yok', text: 'Seni geri takip etmiyor ve taranan gönderilerinde hiç beğeni ya da yorumu yok. Takipten çıkma adaylarının çoğu burada.' },
      { term: 'Karşılıklı ama sessiz', text: 'Birbirinizi takip ediyorsunuz ama gönderilerine hiç dokunmamış. Çoğu zaman gerçek bir tanıdık; acele etme.' },
      { term: 'Sessiz takipçi', text: 'Seni takip ediyor ama etkileşim kurmuyor. Genelde bir şey yapmana gerek yok.' },
      { term: 'Sadık', text: 'Düzenli beğenen ve yorum yapanlar. En değerli takipçilerin.' },
    ],
    decideTitle: 'Kimi bırakacağına nasıl karar verirsin',
    decide: [
      'Hayaletlerle başla. Onlar için düşünmeye gerek yok.',
      'Listeyi bir kez kendi gözünle gözden geçir. Ailen, arkadaşların ya da iş bağlantıların etkileşim kurmasa da önemli olabilir.',
      'Ünlüler, markalar ve haber hesapları seni zaten geri takip etmez. İçerikleri için takip ediyorsan listede durmaları normal.',
      'Yeni gönderilerin etkileşimi henüz eksik olabilir. Kararı en az 10 taranmış gönderiden sonra ver.',
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
      { term: 'Beğeni toplama', text: "Yalnızca senin Chrome sekmenden, senin oturumunla. Sunucu Instagram'a bağlanmaz." },
      { term: 'Hayalet kontrolü', text: 'Oturumsuz, çerezsiz bir tarayıcıyla yapılır. Hesabınla bağlantısı yok.' },
      { term: 'Ne zaman çalışır', text: 'Günün her saatinde. Ama yalnızca bir Instagram sekmesi açıkken ve sen bilgisayarın başındayken.' },
      {
        term: 'Uyarı gelirse',
        text: 'Köprü 24 saat durur, bir hafta içinde tekrarlarsa 72 saat. Takip/çıkış işlemleri 6 saat durur ve kuyruk boşaltılır. Uygulamada kırmızı bir şerit çıkar.',
        link: { to: '#uyari', label: 'Ne yapmalı' },
      },
      { term: 'Takip / takipten çıkma', text: 'Varsayılan olarak kapalı. Açılsa bile saatte en fazla 15, günde en fazla 60 işlem; iki işlem arasında en az 60 saniye.' },
      { term: 'Verilerin', text: 'Yalnızca kendi bilgisayarında durur. Ayarlar sayfasındaki "Tüm verimi sil" ile hepsini silebilirsin.', link: { to: '/settings', label: 'Ayarlar' } },
    ],
    riskTitle: 'Risk profili neyi değiştirir',
    risk: "Ayarlar'da üç profil var: Güvenli, Dengeli, Agresif. Profil beklemeleri ve günlük sınırları belirler. Örneğin köprü günde 12, 20 ya da 30 gönderi okur. Çoğu kişi için Güvenli yeterli. Agresif'te uyarı alma ihtimali belirgin şekilde artar.",
    limitsTitle: 'Bilinen sınırlar',
    limits: [
      'Instagram eşiklerini açıklamaz. Buradaki sayılar tahmindir.',
      'Hiçbir ayar "hesabım kısıtlanmaz" garantisi vermez. Ayarlar sadece riski düşürür.',
      'Kullanılan Instagram adresleri belgelenmemiştir ve değişebilir.',
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
      { term: 'Gözden çıkar sayfası "yeterli veri yok" diyor.', text: 'En az 10 gönderinin taranmış olması gerekir. Köprü eklentisini kur ve birkaç gün bekle.' },
      { term: 'Eklenti hiçbir şey toplamıyor.', text: 'Bir Instagram sekmesi açık mı? Son birkaç dakikada bilgisayarı kullandın mı? Günlük sınır dolmuş mu? Kurulumdan sonra Instagram sekmesini yeniledin mi? Durum, eklenti penceresinde yazar.' },
      {
        term: 'Eklenti "duraklatıldı" diyor, simgede kırmızı "!" var.',
        text: "Instagram bir uyarı göstermiş. 24 saat (bir hafta içinde tekrarlarsa 72 saat) beklenir. Hiçbir düğmeye basma, Instagram'ı telefonundan normal kullan, istenirse doğrulamayı kendin yap.",
        link: { to: '#uyari', label: 'Ayrıntı' },
      },
      { term: 'Eklentinin klasörünü sildim.', text: 'Chrome eklentiyi o klasörden çalıştırır. Eklentiyi yeniden indir, aç ve "Paketlenmemiş öğe yükle" ile tekrar seç.' },
      { term: 'Hayalet görünen biri aslında aktif.', text: 'Hesap kısa süre kapalı kalmış olabilir. Takipten çıkmadan önce profiline kendin bak.' },
      { term: 'Bütün verimi silmek istiyorum.', text: 'Ayarlar sayfasında profili seç ve "Tüm verimi sil"e bas. Geri alınamaz.' },
    ],
  },

  files: {
    intro: 'Kurulumda ve denemede işine yarayacak dosyalar. Hepsi bu sayfada, bilgisayarında hazırlanır.',
    ext: {
      title: 'Köprü eklentisi (.zip)',
      text: 'Chrome eklentisinin klasörü. İndir, aç, Chrome\'a "Paketlenmemiş öğe" olarak yükle.',
      button: 'Eklentiyi indir',
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
          'Rehberdeki Referans dosyalar bölümünden eklentiyi indir (instaanalytic-kopru.zip)',
          'ZIP\'e çift tıkla (Windows: sağ tık → Tümünü ayıkla), çıkan klasörü silme',
          'Adres çubuğuna chrome://extensions yaz (tıklanmaz, elle yazılır)',
          'Sağ üstte Geliştirici modu → aç',
          'Paketlenmemiş öğe yükle → instaanalytic-kopru klasörünü seç (içinde manifest.json olan)',
          'Listede "InstaAnalytic Köprüsü 1.0.0" kartı var, "Hatalar" düğmesi yok',
          'Yapboz parçası → InstaAnalytic Köprüsü yanındaki raptiye',
          'Açık Instagram sekmesini bir kez yenile',
          'Eklenti penceresinde profilini seç, "Beğenenleri toplamaya izin ver"i aç',
          'Ayarlar sayfasında "Eklenti bağlı" ve yeşil nokta görünüyor',
          'Instagram sekmesini açık tut, normal kullanmaya devam et',
        ],
      },
      {
        title: '4. Karar vermeden önce',
        items: [
          'En az 10 gönderi tarandı',
          'Takipçi listesi eksiksiz ("Tüm zamanlar")',
          'Gözden çıkar listesini kendi gözünle gözden geçirdim',
          "Takipten çıkmayı Instagram'dan elle, günde birkaç düzineyi geçmeden yapacağım",
        ],
      },
      {
        title: 'Instagram uyarı verirse',
        items: [
          'Hiçbir düğmeye basma, durdurmayı aşmaya çalışma',
          "Instagram'ı telefonundan normal kullan",
          'Doğrulama istenirse kendin tamamla',
          '24 saat bekle (bir hafta içinde tekrarlarsa 72 saat)',
          'Risk profilini Güvenli yapmayı düşün',
        ],
      },
    ],
    footer: 'Hatırlatma: hiçbir araç sıfır risk garanti edemez. Instagram bir uyarı gösterirse toplama kendiliğinden durur; bekle ve hiçbir şeyi zorlama.',
  },
}

const en: GuideContent = {
  title: 'User guide',
  subtitle: 'Setting up for the first time? Start here. Each section takes a few minutes to read.',
  tocLabel: 'On this page',
  sections: {
    start: 'Getting started',
    zip: 'Add your data (ZIP)',
    bridge: 'Collect likers',
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
        title: 'Collect likers (optional)',
        text: 'To see who likes and comments, install the Browser bridge extension in Chrome. The ZIP does not include this.',
        link: { to: '#kopru', label: 'Bridge extension' },
      },
      {
        title: 'Look at the results',
        text: 'Follower Analysis is ready as soon as the ZIP is in. Cleanup and Follower Score need at least 10 scanned posts.',
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
    intro: 'The Browser bridge is a Chrome extension. It collects who liked and who commented on your own posts.',
    howTitle: 'How it works',
    how: 'The extension reads from inside the Instagram tab you are already logged into. Requests come from the same device, the same internet connection and the same session as your everyday use. The InstaAnalytic server never connects to Instagram; the extension only passes what it reads to the app on your computer. It only reads: it never follows, likes or sends messages.',
    rulesTitle: 'Limits it sets for itself',
    rules: [
      'It can run at any hour, but only while an Instagram tab is open and you are at the computer.',
      'Waits 25–80 seconds between posts and takes a long break every few posts.',
      'Reads at most 12 posts a day (Safe). 20 on Balanced, 30 on Aggressive.',
      'Reads a new post right away. A post read in its first 3 days is read once more after it turns 3 days old, so late likes are counted too.',
      'Any warning from Instagram stops everything on its own. What to do is right below.',
    ],
    warning: {
      title: 'If Instagram shows a warning',
      intro: 'Please read this part. If Instagram shows any of these, the extension stops collecting at once:',
      signs: [
        'A "Too many requests" error (429)',
        'A "feedback_required" or "Try again later" warning',
        'A verification screen such as "Confirm it\'s you"',
        'Instagram sending you to the login page',
      ],
      effectsTitle: 'What happens',
      effects: [
        'Collection stops for 24 hours. If it happens again within a week, for 72 hours.',
        'A red banner appears at the top of every page in the app.',
        'The extension icon shows a red "!" badge.',
      ],
      doTitle: 'What you should do',
      do: [
        'Do not press anything in the app or the extension. Not even "Şimdi dene" (Try now).',
        'Use Instagram from your phone as you normally would.',
        'If Instagram asks for verification, complete it yourself.',
        'Wait for the pause to end. Collection then continues on its own.',
        'Consider switching the risk profile to Safe in Settings.',
      ],
      never: 'Never try to get around the pause. Do not remove and reinstall the extension, and do not try another browser or computer. That puts your account at greater risk.',
      alt: 'What it looks like after a warning: a red banner across the top of the app and a red exclamation mark on the extension icon in the toolbar.',
      caption: 'Red banner and a "!" on the icon: collection has stopped.',
    },
    installTitle: 'Installing, step by step (about 5 minutes)',
    installIntro: 'Each picture marks what to click with a coloured frame and a number. The pictures are simplified versions of Chrome; yours may look a little different. You only do this once.',
    install: [
      {
        art: 'download',
        title: 'Download the extension',
        text: 'Scroll to Reference files at the bottom of this page and press "Download extension". A file named instaanalytic-kopru.zip is downloaded.',
        link: { to: '#referans', label: 'Reference files' },
        alt: 'The Reference files section of the guide. The "Download extension" button on the right of the bridge extension card is marked.',
        caption: 'Press "Download extension".',
      },
      {
        art: 'unzip',
        title: 'Unzip the file',
        text: 'Open your Downloads folder. Double-click instaanalytic-kopru.zip. A folder named instaanalytic-kopru appears next to it.',
        tip: 'On Windows: right-click the file, choose "Extract All", then press "Extract". Do not delete or move the new folder. Chrome runs the extension from it.',
        alt: 'The Downloads folder. instaanalytic-kopru.zip is double-clicked and an instaanalytic-kopru folder appears next to it.',
        caption: 'Double-click it and a folder appears.',
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
        title: 'Pick the instaanalytic-kopru folder',
        text: 'In the window that opens, go to Downloads. Click the instaanalytic-kopru folder once, then press "Select".',
        tip: 'Do not pick the ZIP file or the folder above it. The right folder has a file called manifest.json inside.',
        alt: 'A folder picker. The instaanalytic-kopru folder is selected and marked; the zip file is labelled "not this". The "Select" button at the bottom right is marked.',
        caption: 'Pick the folder, not the ZIP.',
      },
      {
        art: 'card',
        title: 'Check that it is in the list',
        text: 'A card named "InstaAnalytic Köprüsü 1.0.0" appears in the list. The switch at the bottom right of the card should be on.',
        tip: 'If the card shows a red "Errors" button, something went wrong. See "If the install did not work" below.',
        alt: 'The InstaAnalytic Köprüsü 1.0.0 card on the Extensions page is marked. Next to it, a red "Errors" button is shown as a sign of trouble.',
        caption: 'If the card is there, it is installed.',
      },
      {
        art: 'pin',
        title: 'Pin it to the toolbar',
        text: 'Click the puzzle-piece icon (Extensions) to the right of the address bar. In the list, press the pin next to InstaAnalytic Köprüsü. Its icon now stays visible.',
        alt: 'The puzzle-piece icon in the Chrome toolbar is marked. In the Extensions list that opens, the pin icon on the InstaAnalytic Köprüsü row is marked.',
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
        title: 'Open the extension and allow it',
        text: 'Click the extension icon in the toolbar. A small window opens. Pick your profile in the Profil row; it is usually already picked. Then turn on the "Beğenenleri toplamaya izin ver" (allow collecting likers) switch at the top.',
        alt: 'The extension popup. The extension icon in the toolbar, the Profil row and the "Beğenenleri toplamaya izin ver" switch are marked in order.',
        caption: 'Icon, profile, then the switch.',
      },
      {
        art: 'connected',
        title: 'Check that it is connected',
        text: 'In the app, open Settings or Cleanup. If the "Browser bridge" card shows a green dot and "Extension connected", you are done.',
        tip: 'It can take a minute or two to connect. If you do not see it, wait a little and reload the page.',
        link: { to: '/settings', label: 'Settings' },
        alt: 'The Browser bridge card on the Settings page of the app. The green dot and "Extension connected" are marked.',
        caption: 'Green dot: the extension is connected.',
      },
    ],
    ui: {
      zipName: 'instaanalytic-kopru.zip',
      folderName: 'instaanalytic-kopru',
      appTab: 'InstaAnalytic',
      guideHeading: 'Reference files',
      extCardTitle: 'Bridge extension (.zip)',
      extCardText: 'The Chrome extension folder.',
      extButton: 'Download extension',
      samplesTitle: 'Sample ZIP files',
      downloads: 'Downloads',
      desktop: 'Desktop',
      documents: 'Documents',
      doubleClick: 'double-click',
      winHint: 'Windows: right-click → Extract All',
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
      notThis: 'not this',
      extName: 'InstaAnalytic Köprüsü',
      extVersion: '1.0.0',
      details: 'Details',
      remove: 'Remove',
      errors: 'Errors',
      errorsHint: 'This button means trouble',
      manageExtensions: 'Manage extensions',
      reloadOr: 'or',
      reloadWin: 'Windows',
      reloadMac: 'Mac',
      // Eklenti penceresi yalnızca Türkçe; resim gerçeğiyle aynı kalsın.
      popupToggle: 'Beğenenleri toplamaya izin ver',
      popupNote: 'Yalnızca Instagram bir sekmede açıkken çalışır.',
      popupStatus: "Instagram'dan okunuyor…",
      popupToday: 'Bugün',
      popupTodayValue: '3 istek',
      popupLast: 'Son istek',
      popupNext: 'Sonraki',
      popupProfile: 'Profil',
      popupProfileValue: '@your_username',
      popupProfileOption: '@your_username — bu hesap',
      popupChange: 'Değiştir',
      popupTryNow: 'Şimdi dene',
      popupOpenApp: 'Uygulamayı aç',
      settingsHeading: 'Settings',
      bridgeTitle: 'Browser bridge',
      bridgeConnected: 'Extension connected',
      bridgeDesc: 'Reads likers slowly from your own Chrome.',
      bridgeProgress: '4 / 12 posts read',
      bridgeStop: 'Stop',
      warnBanner: 'Instagram showed a warning. Paused for 24 hours.',
    },
    copy: { button: 'Copy', done: 'Copied', failed: 'Could not copy. Type it instead.' },
    stepLabel: 'Step',
    devAlt: 'For developers: the same folder is in the repo at frontend/extension. You can pick it directly in step 6.',
    troubleTitle: 'If the install did not work',
    troubleIntro: 'The most common cases and how to fix them:',
    trouble: [
      { term: 'There is no "Load unpacked" button.', text: 'Developer mode is off. Turn on the switch at the top right of the Extensions page.' },
      {
        term: '"Manifest file is missing or unreadable" error',
        text: 'The wrong folder was picked. Pick the instaanalytic-kopru folder that has manifest.json inside, not the ZIP and not the folder above it. Windows may put it one level deeper; if so, go one folder in.',
      },
      { term: 'The extension says to reload the Instagram tab.', text: 'The Instagram tab was opened before the install. Reload it once (F5, Cmd+R on a Mac).' },
      { term: 'The popup says "Uygulama kapalı" (app is closed).', text: 'InstaAnalytic is not running. Start the app. The extension reconnects on its own within a few minutes.' },
      { term: 'The card says another @account is open on Instagram.', text: 'A different Instagram account is logged in in Chrome. Switch to this profile\'s account on Instagram, or pick the right profile in the popup.' },
      { term: 'The extension card has a red "Errors" button.', text: 'Press it and read the message. Usually the wrong folder was picked. Remove the extension and load the right folder again.' },
      { term: 'The extension icon is not in the toolbar.', text: 'Click the puzzle-piece icon and press the pin next to InstaAnalytic Köprüsü.' },
      { term: 'The card still says the extension has not connected.', text: 'Is the switch in the popup on and a profile picked? Is an Instagram tab open? Wait a minute or two and reload the page.' },
    ],
    afterTitle: 'After that',
    after: 'Use Instagram as usual. The extension moves slowly in the background. For an account with 100 posts on the Safe profile, reading all of them takes about 9 days. The Posts page shows how many are scanned.',
    limitTitle: 'To be clear',
    limit: 'This lowers the risk a lot but not to zero. No tool can promise zero risk. The addresses the extension uses are undocumented Instagram internals and can change without notice. If that happens, collection stops and the extension needs an update.',
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
      { term: 'Posts', text: 'Your posts and which of them have likes/comments collected.', link: { to: '/posts', label: 'Open' } },
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
    groupsNote: 'This page looks at who liked or commented on your most recently scanned posts. For the result to be right, at least 10 posts must be scanned and the follower list must be complete ("All time" in the ZIP).',
    groups: [
      { term: 'Ghosts', text: 'Deleted or frozen accounts. Following them no longer means anything. The easiest group to drop.' },
      { term: 'You follow them, they do not follow you, no engagement', text: 'They do not follow back and have no likes or comments on your scanned posts. Most unfollow candidates are here.' },
      { term: 'Mutual but quiet', text: 'You follow each other but they never touch your posts. Often a real acquaintance; take your time.' },
      { term: 'Quiet follower', text: 'Follows you but does not engage. Usually nothing to do here.' },
      { term: 'Loyal', text: 'People who like and comment regularly. Your most valuable followers.' },
    ],
    decideTitle: 'Deciding who to drop',
    decide: [
      'Start with ghosts. No thinking needed.',
      'Go through the list yourself once. Family, friends or work contacts can matter even if they never engage.',
      'Celebrities, brands and news accounts will not follow you back anyway. If you follow them for their content, it is normal that they show up.',
      'Engagement on new posts may still be incomplete. Decide after at least 10 scanned posts.',
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
      { term: 'Collecting likes', text: 'Only from your own Chrome tab, with your own session. The server does not connect to Instagram.' },
      { term: 'Ghost check', text: 'Done in a browser with no login and no cookies. Not linked to your account.' },
      { term: 'When it runs', text: 'At any hour, but only while an Instagram tab is open and you are at the computer.' },
      {
        term: 'If a warning appears',
        text: 'The bridge pauses for 24 hours, 72 if it happens again within a week. Follow/unfollow actions stop for 6 hours and the queue is cleared. A red banner appears in the app.',
        link: { to: '#uyari', label: 'What to do' },
      },
      { term: 'Follow / unfollow', text: 'Off by default. Even when on: at most 15 an hour, 60 a day, at least 60 seconds apart.' },
      { term: 'Your data', text: 'Stays on your computer. "Delete all my data" on the Settings page removes everything.', link: { to: '/settings', label: 'Settings' } },
    ],
    riskTitle: 'What the risk profile changes',
    risk: 'Settings has three profiles: Safe, Balanced, Aggressive. The profile sets the waits and daily limits. For example, the bridge reads 12, 20 or 30 posts a day. Safe is enough for most people. Aggressive makes a warning noticeably more likely.',
    limitsTitle: 'Known limits',
    limits: [
      'Instagram does not publish its thresholds. The numbers here are estimates.',
      'No setting guarantees your account will not be restricted. Settings only lower the risk.',
      'The Instagram addresses used are undocumented and can change.',
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
      { term: 'Cleanup says there is not enough data.', text: 'At least 10 posts must be scanned. Install the bridge extension and give it a few days.' },
      { term: 'The extension collects nothing.', text: 'Is an Instagram tab open? Have you used the computer in the last few minutes? Is the daily limit used up? Did you reload the Instagram tab after installing? The extension popup shows the status.' },
      {
        term: 'The extension says "paused" and its icon has a red "!".',
        text: 'Instagram showed a warning. It waits 24 hours (72 if it happens again within a week). Do not press anything, use Instagram normally from your phone, and complete any verification yourself.',
        link: { to: '#uyari', label: 'Details' },
      },
      { term: "I deleted the extension's folder.", text: 'Chrome runs the extension from that folder. Download it again, unzip it and pick it with "Load unpacked".' },
      { term: 'Someone marked as a ghost is actually active.', text: 'The account may have been off for a short time. Check their profile yourself before unfollowing.' },
      { term: 'I want to delete all my data.', text: 'On the Settings page, pick the profile and press "Delete all my data". This cannot be undone.' },
    ],
  },

  files: {
    intro: 'Files that help with setup and trying things out. All of them are prepared on your computer, in this page.',
    ext: {
      title: 'Bridge extension (.zip)',
      text: 'The Chrome extension folder. Download, unzip, and load it into Chrome as an unpacked extension.',
      button: 'Download extension',
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
          'Download the extension from Reference files in the guide (instaanalytic-kopru.zip)',
          'Double-click the ZIP (Windows: right-click → Extract All) and keep the new folder',
          'Type chrome://extensions in the address bar (it cannot be clicked)',
          'Top right: turn on Developer mode',
          'Load unpacked → pick the instaanalytic-kopru folder (the one with manifest.json)',
          'The "InstaAnalytic Köprüsü 1.0.0" card is in the list, with no "Errors" button',
          'Puzzle piece → pin next to InstaAnalytic Köprüsü',
          'Reload the open Instagram tab once',
          'In the popup, pick your profile and turn on "Beğenenleri toplamaya izin ver"',
          'Settings shows "Extension connected" with a green dot',
          'Keep an Instagram tab open and use it as usual',
        ],
      },
      {
        title: '4. Before deciding',
        items: [
          'At least 10 posts are scanned',
          'The follower list is complete ("All time")',
          'I went through the Cleanup list myself',
          'I will unfollow by hand in Instagram, no more than a few dozen a day',
        ],
      },
      {
        title: 'If Instagram shows a warning',
        items: [
          'Do not press anything and do not try to get around the pause',
          'Use Instagram normally from your phone',
          'Complete any verification yourself',
          'Wait 24 hours (72 if it happens again within a week)',
          'Consider switching the risk profile to Safe',
        ],
      },
    ],
    footer: 'Reminder: no tool can promise zero risk. If Instagram shows a warning, collection stops on its own; wait and do not force anything.',
  },
}

const CONTENT: Record<GuideLang, GuideContent> = { tr, en }

export const guideContent = (lang: string): GuideContent => CONTENT[lang === 'en' ? 'en' : 'tr']
