# InstaAnalytic Köprüsü (Chrome eklentisi)

Kendi Instagram gönderilerinizi kimin beğendiğini ve kimin yorum yaptığını, siz Instagram'da gezerken
kaydeder ve bu bilgisayarda çalışan InstaAnalytic uygulamasına iletir.

## Nasıl çalışır

Eklenti **Instagram'a kendisi hiçbir istek göndermez.** Zamanlayıcısı yoktur, arka planda bir şey açmaz,
tıklamaz, kaydırmaz.

Siz kendi gönderinizi açıp altındaki "beğenme" sayısına tıkladığınızda Instagram'ın sayfası beğenenler
listesini zaten indirir. Eklenti bu yanıtın bir kopyasını okur ve uygulamaya gönderir. Profilinizi açıp
aşağı kaydırdığınızda gönderi listeniz, bir gönderiyi açtığınızda yorumlar da aynı şekilde gelir.

Instagram'ın gördüğü her istek sizin kendi tıklamanızdır. Bu yüzden normal kullanımdan ayırt edilemez ve
Instagram adreslerini değiştirse de çalışmaya devam eder.

Uygulama yalnızca **sizin gönderilerinize** ait beğenen ve yorumları saklar. Akış, keşfet, mesajlar ve
bildirimler eklentiden hiç geçmez; başkasının gönderi sayfasında yakalanan bir liste de uygulamada atılır.

## Güvenlik ve izinler

Eklenti yalnızca okur. Kararları (neyin kaydedileceği, bir yanıtın uyarı sayılıp sayılmayacağı, size ne
gösterileceği) bu bilgisayardaki uygulama verir.

**İstediği izinler**

| İzin | Neden |
|---|---|
| `storage` | Açık/kapalı ayarı, uygulama adresi ve hangi Instagram hesabının hangi profile ait olduğu. |
| `http://localhost:3002`, `http://127.0.0.1:3002` | Okunan yanıtları yalnızca bu bilgisayardaki uygulamaya iletmek. |
| instagram.com'da içerik betiği | Sayfanın indirdiği yanıtların kopyasını okumak. |

Çerez izni yoktur; oturum çerezinize (`sessionid`) erişemez. Hangi hesabın açık olduğunu anlamak için
yalnızca sayfanın kendi kodunun da okuyabildiği `ds_user_id` değerini (hesabın sayısal kimliği) okur.

**Yapmadıkları**

- Instagram'a istek göndermez, istekleri değiştirmez, sayfada tıklamaz ya da kaydırmaz.
- Kapalıyken hiçbir yanıtı kopyalamaz.
- Yalnızca kendi profil sayfanızda ve gönderi sayfalarında, yalnızca gönderi / beğenen / yorum / profil
  ızgarası yanıtlarını iletir. Mesajlar, bildirimler, hikâyeler, arama ve keşfet hiç okunmaz.
- İstek gövdesinden yalnızca sorgu adını ve değişkenleri alır; `fb_dtsg`, `lsd` gibi oturum anahtarları
  hiçbir zaman alınmaz ya da iletilmez.
- Veriyi yalnızca `localhost`'taki uygulamaya gönderir; başka bir adrese gönderemez (adres alanı bunu engeller).
- Kayıt (log) tutmaz; çerez, yanıt ya da kişisel veri yazmaz.
- Uzaktan kod yüklemez; tüm kod bu klasördedir.

**Bilinen sınır:** Yanıtları okuyabilmek için sayfanın `fetch` ve `XMLHttpRequest` işlevlerini sarmalar.
Sarmalayıcı yanıtı değiştirmez, yalnızca bir kopyasını okur. Bu, reklam engelleyiciler gibi yaygın
eklentilerin de kullandığı bir yöntemdir.

## Kurulum

1. Chrome'da adres çubuğuna `chrome://extensions` yazın.
2. Sağ üstteki **Geliştirici modu**nu açın.
3. **Paketlenmemiş öğe yükle** düğmesine basın ve InstaAnalytic klasöründeki `frontend/extension`
   klasörünü seçin (içinde `manifest.json` olan klasör).
4. Açık Instagram sekmelerini yenileyin.
5. Eklenti simgesine tıklayın, **Durum** sekmesinde **Gezinirken beğenenleri kaydet**'i açın. Profil otomatik
   eşleşmezse **Ayarlar** sekmesinden seçin.

Klasöre ulaşamıyorsanız eklentiyi uygulamadaki **Kılavuz → Referans dosyalar**'dan zip olarak da
indirebilirsiniz; ama o kopya kendiliğinden güncellenmez.

## Kullanım

1. Instagram'da kendi profilinizi açın ve bir kez en aşağı kaydırın. Gönderileriniz uygulamada görünür.
2. Bir gönderiyi açın, altındaki "beğenme" sayısına tıklayın ve açılan listeyi sonuna kadar kaydırın.
3. Listeyi kapatıp sonraki gönderiye geçin. Uygulamadaki "Tarayıcı köprüsü" kartı hangi gönderilerin
   kaldığını gösterir.

Acele etmeyin. Bir oturumda 5–10 gönderi yeterli; işi birkaç güne yayın.

## Instagram uyarı verirse

Instagram'dan "Çok fazla istek", "Daha sonra tekrar dene", doğrulama ya da giriş sayfası gibi bir yanıt gelirse
eklenti bunu fark eder. Simgede kırmızı **!** çıkar, uygulama her sayfada kırmızı bir uyarı gösterir.

- En az 24 saat beğenen listelerini açmayın (bir hafta içinde tekrarlarsa 72 saat).
- Instagram'ı telefondan normal kullanın, doğrulama isterse kendiniz tamamlayın.
- Sonra daha yavaş devam edin. Uyarıyı aşmaya çalışmayın.

## Güncelleme

Normalde yapmanız gereken bir şey yok. Eklenti uygulamanın klasöründen yüklendiyse, uygulama
güncellendiğinde dosyaları da güncellenir. Eklenti birkaç saatte bir (ve açılır pencere açıldığında,
Instagram sayfası yüklendiğinde) uygulamadaki sürümü denetler; daha yeniyse kendini yeniden yükler ve
"güncellendi" der. Ardından açık Instagram sekmesini bir kez yenileyin.

Zip kopyasından kurduysanız yeniden yükleme yeni dosya getiremez. Eklenti bunu fark eder, simgede sarı **↑**
gösterir ve **Güncelleme** sekmesinde tek seferlik çözümü anlatır: eski eklentiyi kaldırıp `frontend/extension`
klasörünü yükleyin. Bundan sonra güncellemeler kendiliğinden gelir.

**Güncelleme** sekmesinde yüklü sürümü, uygulamadaki sürümü ve son denetim zamanını görürsünüz;
**Şimdi denetle** beklemeden denetler. Denetim yalnızca bu bilgisayardaki uygulamaya sorulur.

## Uygulama adresi

Yalnızca bu bilgisayardaki adresler (`localhost` veya `127.0.0.1`) kabul edilir. 3002 dışında bir port
kullanıyorsanız `manifest.json` içindeki `host_permissions` listesine o adresi ekleyip eklentiyi yeniden yükleyin.

## Kaldırma

`chrome://extensions` sayfasında eklentinin kartındaki **Kaldır** düğmesine basın. Eklentinin kendi
ayarları da silinir; uygulamadaki veriler yerinde kalır.
