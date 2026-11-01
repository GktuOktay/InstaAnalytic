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

Uygulama yalnızca **sizin gönderilerinize** ait beğenen ve yorumları saklar. Gezinirken gelen diğer her şey
(akış, başkalarının gönderileri) uygulamada atılır. Mesajlar ve bildirimler hiç okunmaz.

## Kurulum

1. Uygulamadaki **Kılavuz → Referans dosyalar** bölümünden eklentiyi indirip zip'i açın.
2. Chrome'da adres çubuğuna `chrome://extensions` yazın.
3. Sağ üstteki **Geliştirici modu**nu açın.
4. **Paketlenmemiş öğe yükle** düğmesine basın ve açtığınız `instaanalytic-kopru` klasörünü seçin.
5. Açık Instagram sekmelerini yenileyin.
6. Eklenti simgesine tıklayın, **Gezinirken beğenenleri kaydet**'i açın. Profil otomatik eşleşmezse
   listeden seçin.

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

Yeni sürümü indirin, eski klasörün içeriğini yenisiyle değiştirin, `chrome://extensions` sayfasında
eklentinin kartındaki **↻** düğmesine basın ve Instagram sekmesini yenileyin.

## Uygulama adresi

Yalnızca bu bilgisayardaki adresler (`localhost` veya `127.0.0.1`) kabul edilir. 3002 dışında bir port
kullanıyorsanız `manifest.json` içindeki `host_permissions` listesine o adresi ekleyip eklentiyi yeniden yükleyin.

## Kaldırma

`chrome://extensions` sayfasında eklentinin kartındaki **Kaldır** düğmesine basın. Eklentinin kendi
ayarları da silinir; uygulamadaki veriler yerinde kalır.
