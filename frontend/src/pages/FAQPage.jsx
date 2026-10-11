import { useState, useMemo } from 'react';
import { HelpCircle, Search, ChevronDown, Sparkles, Bot, Clapperboard, Tv, ShoppingBag, Users, Handshake, CreditCard, Film, GraduationCap, Wrench, MessageCircle, X } from 'lucide-react';
import { PageShell, Empty } from '../components/PageKit.jsx';

// ─── Arabic Content ────────────────────────────────────────────────────────
const faqs_ar = [
  {
    category: '🌟 عن Erivion',
    questions: [
      { q: 'ايه هي Erivion وبتقدم ايه بالظبط؟', a: 'Erivion منصة بتحول أي فكرة، سكريبت، أو حتى صورة، لفيديو جاهز بالذكاء الاصطناعي — صوت، موسيقى، وكابشن، من غير ما تحتاج خبرة مونتاج. الايجنت الذكي بيبني الفيديو معاك خطوة بخطوة (صورة مرجعية لو محتاج شخصية ثابتة تفضل زي ما هي في كل المشاهد، صور المشاهد، وبعدين تحريكها فيديو) مستخدم أحدث موديلات الصور والفيديو المتاحة، وبيختارلك أنسب موديل لكل مشهد تلقائيًا من غير ما تحتاج تختار حاجة بنفسك.' },
      { q: 'هل فيه خطة مجانية؟', a: 'مفيش خطة مجانية دايمة: أي حساب جديد بيبدأ برصيد كريديت صفر، وتشحن (مصري عن طريق InstaPay، أو دولي عن طريق Gumroad) قبل ما تعمل فيديو.\nلكن فيه تجارب مجانية مرة واحدة لكل حساب: مونتاج مجاني لفيديوهاتك (لحد دقيقتين و6 فيديوهات، بعلامة Erivion المائية)، وأول دقيقة من فيلم وثائقي بصوتك أنت (بعلامة مائية كمان).' },
      { q: 'إمتى أستخدم الايجنت وإمتى أستخدم صفحة موديل معينة مباشرة؟', a: 'الايجنت هو الطريق الافتراضي والأسهل لأي فيديو جديد — بيبني الفيديو بالكامل من وصفك للفكرة وبيختار أحدث الموديلات المتاحة تلقائيًا. صفحات الموديلات القديمة المرقمة (زي Model 3، 4، 5) لسه شغالة بس بقت خيار إضافي بس، مش الأساس — تقدر تستخدمها لو انت مشترك فيها من قبل، أو لو طلبت موديل معين بالاسم صراحة.' },
    ],
  },
  {
    category: '🤖 الايجنت الذكي',
    questions: [
      { q: 'الايجنت بيفتكر طلباتي القديمة؟', a: 'أيوه — لو طلبت فيديو بطريقة أو خطة غير مألوفة (سكريبت بصيغة خاصة مثلاً)، الايجنت بيحفظ إزاي فهمها ونفذها. لو بعتّله نفس الخطة أو حاجة قريبة منها تاني، بيتعرف عليها ويقدر يتحرك أسرع من غير ما يعيد كل أسئلة التوضيح من الأول.' },
      { q: 'أقدر أطلب فيديو عن حدث حقيقي أو تاريخي؟', a: 'أيوه، وده بالظبط اللي الايجنت اتصمم عشانه — لما تطلب فيديو عن حدث حقيقي أو تاريخي، بيقدر يتأكد من المعلومات ببحث فعلي على الإنترنت قبل ما يكتب السكريبت، ولو سألته "مصادرك ايه؟" بيديك الروابط الحقيقية اللي استخدمها.' },
      { q: 'الايجنت يقدر يعدّل في بيانات حسابي؟', a: 'في حدود بسيطة وآمنة فقط، وبعد موافقتك الواضحة في المحادثة — زي تغيير اسمك المعروض، أو تحديد إن حسابك مصري ولا دولي. أي حاجة تخص الرصيد أو الخطة بتتم فقط عن طريق دفع حقيقي أو مراجعة الأدمن، مش من خلال الشات مباشرة.' },
      { q: 'أقدر أشترك من خلال الشات مباشرة؟', a: 'أيوه، قوله "عايز أشترك" وهو هيسألك (لو مش عارف) انت مصري ولا برة مصر، يوريك الباقات المناسبة، وبعدين يفتحلك شاشة الدفع هنا في نفس الشات (InstaPay للمصريين، Gumroad للدوليين) — من غير ما تتنقل لصفحة تانية.' },
    ],
  },
  {
    category: '🎞️ الأفلام الوثائقية والمونتاج',
    questions: [
      { q: 'إيه هو استوديو الأفلام الوثائقية؟', a: 'بتديله موضوع أو سكريبت جاهز أو تعليق صوتي سجلته بنفسك، ويطلعلك فيلم وثائقي كامل: لقطات حقيقية وأرشيفية من مصادر عامة (NASA وWikimedia Commons وInternet Archive وPexels)، موشن جرافيك، خرائط، لوحات صور، وكابشن. أفلام أفقية لحد 30 دقيقة وشورتس رأسي 9:16 لحد 3 دقايق. السعر بالكريديت حسب مدة الفيلم وبتشوفه قبل ما تبدأ.' },
      { q: 'إزاي أعمل مونتاج لفيديوهاتي؟', a: 'من شات الايجنت: زرار + ← ارفع فيديوهات للمونتاج. تقدر ترفع لحد 20 فيديو (مجموع لقطاتها لحد 20 دقيقة) وتعليق صوتي لو عايز، وصور أو فيديو كمرجع لستايل الموشن جرافيك. الايجنت بيفهم كل مشهد، يقترح عليك خطة وسعر، وبعد موافقتك بيبدأ. الفيديوهات المرفوعة بتتحفظ 3 ساعات بس. السعر بيبدأ من حوالي 2 كريديت وبيزيد مع المدة (الدقيقة حوالي 4 كريديت).' },
      { q: 'المونتاج بيطلع شكل واحد ولا بيختلف؟', a: 'بيختلف حسب خطتك ومزاجك: انتقالات بس بنفس ترتيب مشاهدك، مشاهد متزامنة مع تعليقك الصوتي لقصة، مونتاج صنّاع محتوى بجرافيكس كتير ولقطات مقربة، أو إيقاع هادي. وتقدر تحدد مستوى المؤثرات الصوتية (بدون، خفيف، عادي، قوي) والموسيقى (بتتضاف بس لو وافقت). قوله اللي في دماغك والايجنت يختار الباقي.' },
      { q: 'إيه هي مشاهد الموشن 3D في المونتاج؟', a: 'لما حد بيتكلم قدام الكاميرا، الايجنت بيفصل الصوت عن الصورة ويختار من 2 لـ 8 لحظات ويحط مكانها مشاهد موشن جرافيك 3D بتتعمل بالكود عن اللي بتقوله (عنوان، كلمات مفتاحية، قايمة، رقم، مقارنة). صوتك الأصلي بيكمّل من غير قطع واللقطة بترجع بعدها، والكابشن بيقف أثناء المشهد. محتاج كلام واضح في الفيديو، ومش بتتعمل في وضع "انتقالات بس" أو لو قلتله مش عايزها.' },
      { q: 'أقدر أرفع صورة أو فيديو بستايل موشن جرافيك معين وييجي زيه؟', a: 'أيوه. الصورة بتتستخدم تلقائيًا كمرجع للألوان وأقرب نوع جرافيك. الفيديو بيتقرأ بموديل فيديو رخيص بيشوف الحركة والانتقالات (حوالي 1–2 كريديت للفيديو المرجعي، وبيتردّ لو القارئ ما اشتغلش). النتيجة بتطلع أقرب شبه من مكتبة الجرافيك عندنا من حيث الألوان والأنواع والإيقاع، مش نسخة طبق الأصل.' },
      { q: 'الكابشن بيطلع بأي لغة؟', a: 'بلغة الكلام الفعلي في الفيديو — بنكتشفها من الصوت نفسه، يعني فيديو إنجليزي بيطلع كابشنه إنجليزي حتى لو بتكلم الايجنت بالعربي.' },
      { q: 'فيه مونتاج مجاني؟', a: 'أيوه، مرة واحدة لكل حساب: ناتج لحد دقيقتين وحد أقصى 6 فيديوهات، بعلامة Erivion المائية. بعد كده المونتاج بالكريديت.' },
    ],
  },
  {
    category: '📺 قنواتك على يوتيوب',
    questions: [
      { q: 'إيه اللي بتعمله صفحة قنواتي؟', a: 'بتربط قناتك عن طريق VidIQ، وErivion يقترح عليك فيديو كل يوم بناءً على تحليل القناة. بتوافق على الفكرة، والتنفيذ بيبدأ، وبيجيلك إيميل لما الفكرة والصورة المصغرة والعنوان والوصف والكلمات المفتاحية تجهز في مشروع باسم القناة.' },
      { q: 'هل Erivion بتنشر على قناتي؟', a: 'لأ. Erivion بتجهّز لك كل حاجة وانت اللي بترفع الفيديو على قناتك بنفسك.' },
      { q: 'الصورة المصغرة بتتعمل إزاي؟', a: 'بالذكاء الاصطناعي (Nano Banana 2.1) بعد بحث عن أمثلة ناجحة في مجالك، وبتكون جاهزة مع باقي حزمة يوتيوب.' },
    ],
  },
  {
    category: '🛍️ إعلانات المنتجات',
    questions: [
      { q: 'أعمل إعلان لمنتجي من صورة واحدة؟', a: 'أيوه. ارفع صورة المنتج (وفكرة لو عندك)، والايجنت يتعرف عليه ويقترح فكرة وموديل (Wan 3.0 أو Seedance 2.5 أو Gemini Omni Flash 1.1) بتعليق صوتي مدمج، وانت اللي بتختار وبتوافق على الخطة والسعر قبل أي خصم. الموسيقى بتتضاف بس لو وافقت عليها.' },
      { q: 'إيه هو P-Video Animate؟', a: 'تحريك صورة بحركة فيديو: بتديله صورة شخصية (بخلفيتها) وفيديو فيه حركة وكلام (لحد 60 ثانية)، فالصورة بتتحرك وتتكلم بنفس حركات وكلام الفيديو. الناتج بيطلع في مكان الصورة مش مكان الفيديو الأصلي، يعني مش بيبدّل شخص جوه الفيديو. هو متاح في شات الايجنت بس (زرار + ← Create video، أو اطلب من الايجنت)، والسعر بالثانية بيظهر قدام الموديل.' },
    ],
  },
  {
    category: '🤝 الفريق',
    questions: [
      { q: 'أقدر أشارك الكريديت مع زمايلي؟', a: 'أيوه من صفحة "Team": بتبعت دعوة بإيميل العضو، وهو بيدخل بحسابه الخاص ويستخدم رصيد الفريق. كل عضو بيفضل بخطته وصلاحياته، وتقدر تشيل أي عضو في أي وقت.' },
    ],
  },
  {
    category: '🎭 استوديو الشخصيات',
    questions: [
      { q: 'إيه هو استوديو الشخصيات؟', a: 'صفحة "شخصياتي": بتسجّل شخصيتك أو وجهك (أو شخصية كرتون أو ماسكوت) بصورة واحدة، وبتفضل محفوظة. بعد كده تقدر تستخدمها في أي فيديو أو صورة تعملها من شات الايجنت (زرار + ← My characters) من غير ما ترفع الصورة كل مرة، والايجنت بيحافظ على نفس الشكل. وفيه كمان شخصيات جاهزة بنضيفها إحنا تقدر تحفظها عندك. لو ما اخترتش موديل بنفسك، الفيديوهات اللي فيها شخصية بتتعمل تلقائيًا بـ Seedance 2.5 أو Wan 3.0 أو Gemini Omni Flash 1.1، والايجنت بيقولك الموديل وسعره قبل ما يبدأ.' },
      { q: 'إيه هي قوالب الترند؟', a: 'فيديوهات ترند جاهزة (رقص، كوميدي، سينمائي...) بتختار منها قالب وبتحط شخصيتك أو وجهك، فالشخص اللي في فيديو القالب بيتبدّل بشخصيتك وبيفضل مكان القالب وحركته وصوته زي ما هما (بموديل Wan 2.2 Animate Replace، أو Seedance 2.5 لو القالب فيه تحوّل في الشكل زي لون الشعر أو العضلات). السعر بيظهر قدام كل قالب حسب مدته وجودة الفيديو (720p أو 1080p) وبيتخصم لما تبدأ، ويترجّع لو التوليد فشل.' },
      { q: 'ماعنديش صورة — أقدر أعمل شخصية بالذكاء الاصطناعي؟', a: 'أيوه. في "إضافة شخصية" اختار "اعمل شخصية بالذكاء الاصطناعي"، اوصف الشخصية (السن والشعر والبشرة والملامح) واختار الشكل (واقعي، كرتون 3D، أنمي، رسم) وعدد الخيارات (1 أو 2 أو 4). بنولّدها بـ Nano Banana 2.1 بجسم كامل عشان تبقى مرجع كويس في الفيديوهات، وبتظهر لك بالوش بس. السعر بيظهر قبل ما تبدأ ويترجع لو التوليد فشل، وبتختار الأقرب وتحفظها. ممنوع تكتب أسماء مشاهير أو أشخاص حقيقيين.' },
      { q: 'أقدر أبدّل الشخصية في فيديو أنا صورته؟', a: 'أيوه، وفيه طريقتين. في شات الايجنت ارفع الفيديو وصورة الشخصية — أو اختار شخصية محفوظة من زرار + ← My characters — واحكي اللي عايزه: (1) "خلي الشخصية دي تعمل نفس حركاتي": الشخصية بتتحرك وتتكلم زي الفيديو بنفس الصوت الأصلي، لكن في مكان صورتها هي مش مكان الفيديو (P-Video Animate، لحد 60 ثانية). (2) "بدّل الشخص اللي في الفيديو وخلّي المكان زي ما هو": انت اللي بتختار الموديل من أربعة — Wan 2.2 Animate Replace (الأرخص)، P-Video Replace، Kling 3.0 Omni (فيديو من 3 لـ 10 ثواني بس) لو في الفيديو شخص واحد (لحد 30 ثانية، بيحافظوا على المكان وعلى صوت الفيديو الأصلي)، أو Seedance 2.5 لو أكتر من شخص أو عايز تغيّر الشكل (تقريبي والصوت جديد وسعره أعلى). الايجنت بيعرض الأربعة بأسعارهم الحقيقية وبيسيبك تختار. الايجنت بيسألك لو مش واضح، وبيقولك السعر قبل ما يبدأ. استخدم صور ليك أو لشخصيات عملتها أو لناس موافقين، ومبنقبلش تبديل بوجه مشهور أو شخص حقيقي من غير موافقته.' },
      { q: 'الفيديو فيه أكتر من شخصية وعايز أبدّلهم كلهم — ينفع؟', a: 'P-Video Animate بيحرّك صورة واحدة بس ومش بيحافظ على مشهد الفيديو، فلو عايز تبدّل اتنين أو أكتر في نفس مشهد الفيديو ارفع صورة لكل شخصية وقول مين يحل مكان مين (مثلًا "اللي على الشمال بالصورة الأولى واللي على اليمين بالتانية"). الايجنت بيستخدم Seedance 2.5 ويبعتله الفيديو كمرجع مع الصور. القيود بنقولها قبل ما نبدأ: الفيديو لازم يكون 30 ثانية أو أقل، والحركة بتطلع قريبة جدًا بس مش مطابقة لقطة بلقطة، والأصوات والكلام بيتولدوا من جديد (مش التسجيل الأصلي)، والسعر أعلى لأن الفيديو المرجعي بيزوّد التكلفة (حوالي 4 أضعاف في الثانية) — والسعر الفعلي بيظهر قدامك قبل ما تبدأ. لو الفيديو فيه شخص واحد بس، Wan 2.2 Animate Replace أدق وأرخص وبيحافظ على الصوت الأصلي. ولو عايز شخصية تتحرك بحركة وكلام الفيديو من غير ما يفضل مكانها، استخدم P-Video Animate.' },
      { q: 'أرفع صورة إزاي عشان الشخصية تطلع حلوة؟', a: 'صورة بوجه واضح في اتجاه الكاميرا، إضاءة كويسة، وشخص واحد بس في الصورة. بنقرأ مظهر الشخصية (الوجه والشعر...) تلقائيًا ونستخدمه في وصف الفيديو عشان الشكل يفضل ثابت.' },
    ],
  },
  {
    category: '💳 الاشتراك والدفع',
    questions: [
      { q: 'إزاي الكريديت شغال؟', a: 'رصيد كريديت واحد بيشتغل مع كل الموديلات — تشحن مرة واحدة والكريديت بيفضل في حسابك من غير ما ينتهي أو يتصفّر أسبوعيًا.' },
      { q: 'إزاي أدفع لو أنا في مصر؟', a: 'تحدد عدد الكريديت اللي عايزه، تحوّل المبلغ عن طريق InstaPay على رقم الموقع، ترفع صورة إيصال التحويل، وتدوس "تم الدفع" — طلبك بيتراجع من فريق Erivion خلال 24 ساعة ويتفعّل الكريديت.' },
      { q: 'إزاي أدفع لو أنا برة مصر؟', a: 'تختار الباقة المناسبة وتدفع مباشرة بالكارت عن طريق Gumroad، وبعدها تدوس "I\'ve Paid" — التفعيل بيتم بعد المراجعة.' },
      { q: 'هل فيه استرجاع فلوس؟', a: 'للمصريين (InstaPay): تقدر تطلب استرجاع خلال 4 ساعات فقط من وقت الموافقة على الدفع. بعد كده مفيش استرجاع إلا في حالة عطل تقني مؤكد من عندنا — عدم الرضا عن ستايل الفيديو مش سبب كافي للاسترجاع. التفاصيل الكاملة في صفحة "Refund Policy".' },
      { q: 'فيه خصومات على الباقات؟', a: 'بتظهر خصومات دورية على باقات المصريين في صفحة الأسعار، والسعر المكتوب بعد الخصم هو اللي بتدفعه. لو بدأت الدفع قبل ما الخصم يتجدد، بنحسبلك سعر الخصم اللي دخلت عليه.' },
    ],
  },
  {
    category: '🎬 الموديلات والفيديوهات',
    questions: [
      { q: 'ايه الفرق بين الموديلات؟ وأقدر أختار بنفسي؟', a: 'الايجنت بيختار أنسب موديل لكل مشهد تلقائيًا ويقولك سعره قبل ما يبدأ، وتقدر كمان تختار بنفسك من زرار + جنب الشات ← Create video أو Create image — بتشوف كل موديل بسعره بالكريديت في الثانية.\nأمثلة: Veo وKling وSeedance وWan وLuma لتحريك الفيديو، وNano Banana وSeedream للصور، وP-Video Animate لنقل حركة وكلام فيديو لشخصية جديدة، وGemini Omni Flash لتعديل فيديو موجود. لو المشهد فيه حوار أو نص مكتوب لازم يطلع واضح، الايجنت بيختار موديل مناسب لده.' },
      { q: 'أقدر أعدّل فيديو خلصت عمله قبل كده؟', a: 'أيوه — قوله للايجنت إنك عايز تعدّل حاجة في فيديو اتعمل بالفعل (زي تغيير جو المشهد أو تفاصيل معينة) من غير ما تعمل الفيديو من الأول تاني. المدة الحقيقية للفيديو المصدر هي اللي بتحدد الموديل المستخدم في التعديل تلقائيًا.' },
      { q: 'كام وقت يستغرق تصيير الفيديو؟', a: 'من دقيقة لحد شوية دقايق حسب مدة الفيديو والموديل. لو اتأخر، هتلاقيه في صفحة "My Videos" حتى لو الشاشة قفلت.' },
      { q: 'أقدر أرفع سكريبت أو صوت جاهز؟', a: 'أيوه — تقدر تلصق سكريبت كامل (حتى مقسّم مشاهد) أو ترفع تسجيل صوتي وهيتحول لنارريشن حقيقي في الفيديو.' },
    ],
  },
  {
    category: '🎓 الكورسات',
    questions: [
      { q: 'فيه كورسات لتعلم صناعة الفيديوهات على Erivion؟', a: 'أيوه، صفحة "Courses" فيها فيديو تعريفي مجاني للكل وكورسات بعضها مجاني والباقي لمشتركي Erivion (اللي اشتروا كريديت). كل كورس فيه دروس فيديو ومرفقات، وبنضيف كورسات جديدة باستمرار.' },
    ],
  },
  {
    category: '⚙️ مشاكل تقنية',
    questions: [
      { q: 'الفيديو توقف أثناء التصيير وظهرت رسالة خطأ', a: 'تحقق أولاً من "My Videos" — قد يكون الفيديو اكتمل. في حالة الفشل الكامل تواصل مع الدعم وسنعيد الكريديت.' },
      { q: 'لا أستطيع تسجيل الدخول', a: 'تأكد من تفعيل بريدك الإلكتروني (تحقق من Spam). للمشاكل الأخرى تواصل مع الدعم.' },
      { q: 'الايجنت مش شايف الفيديوهات اللي رفعتها للمونتاج', a: 'فيديوهات المونتاج بتتحفظ 3 ساعات بس. لو عدّت المدة ارفعها تاني. ولو الرد جه فاضي أو ما بدأش بعد "ابدأ"، ابعتله الرسالة تاني — ومفيش حاجة بتتخصم غير لما المونتاج يبدأ فعلًا.' },
    ],
  },
  {
    category: '🤝 الشراكة والعمولة',
    questions: [
      { q: 'ما هو برنامج الشراكة؟', a: 'تقدر تكسب عمولة 20% على كل شحنة كريديت تتم عن طريق رابط الإحالة الخاص بك، بتترحل مباشرة لـ InstaPay بتاعك.' },
      { q: 'كيف أحصل على رابط الإحالة؟', a: 'اذهب إلى "Earn with Erivion" من القائمة الجانبية. رابطك الخاص موجود هناك ويمكنك نسخه ومشاركته مباشرةً.' },
    ],
  },
];

// ─── English Content ───────────────────────────────────────────────────────
const faqs_en = [
  {
    category: '🌟 About Erivion',
    questions: [
      { q: 'What is Erivion and what does it actually offer?', a: "Erivion turns any idea, script, or even a single photo into a finished AI-generated video — voiceover, music, and captions included, no editing experience required. The smart Agent builds your video step by step (a reference image first if a character needs to stay consistent across scenes, then scene images, then animating them into video) using the latest available image and video engines, automatically picking the best one for each scene so you never have to choose anything yourself." },
      { q: 'Is there a free plan?', a: "There is no permanent free plan: a new account starts at 0 credits and you top up (Egypt via InstaPay, international via Gumroad) before generating a video.\nBut there are one-time free trials per account: a free montage of your own videos (up to 2 minutes and 6 videos, with the Erivion watermark) and the first minute of a documentary narrated by your own voice (also watermarked)." },
      { q: 'When should I use the Agent vs. a specific model page directly?', a: "The Agent is the default, easiest path for any new video — it builds the whole thing from your description and automatically picks the latest available engines. The old numbered model pages (Model 3, 4, 5...) still work, but are now an extra option rather than the default — use them if you're already subscribed to one, or if you explicitly ask for a specific model by name." },
    ],
  },
  {
    category: '🤖 AI Agent',
    questions: [
      { q: 'Does the Agent remember my past requests?', a: "Yes — if you request a video in an unusual way (a custom script format, a specific structured plan), the Agent remembers how it understood and handled it. If you or another customer send a similar request later, it recognizes the pattern and can move faster instead of re-asking every clarifying question from scratch." },
      { q: 'Can I ask for a video about a real historical or current event?', a: 'Yes — that\'s exactly what the Agent is built to handle. For real historical/current-event videos, it can verify facts with an actual web search before writing the script, and if you ask "where did you get this from?", it will give you the real source links it used.' },
      { q: 'Can the Agent make changes to my account?', a: "Only within safe, limited bounds, and only after you clearly agree in the conversation — like updating your display name or setting whether you're an Egypt or international customer. Anything involving your credit balance or plan only ever happens through a real payment or admin review, never directly through chat." },
      { q: 'Can I subscribe directly through the chat?', a: 'Yes — just tell it "I want to subscribe" and it will ask (if it doesn\'t already know) whether you\'re in Egypt or international, show you the right packages, and open the actual payment screen right there in the chat (InstaPay for Egypt, Gumroad for international) — no need to navigate anywhere else.' },
    ],
  },
  {
    category: '🎞️ Documentaries & Montage',
    questions: [
      { q: 'What is the Documentary Studio?', a: 'Give it a topic, a ready script or a voiceover you recorded, and you get a full documentary: real and archive footage from public sources (NASA, Wikimedia Commons, Internet Archive, Pexels), motion graphics, maps, photo boards and captions. Landscape films up to 30 minutes and vertical 9:16 shorts up to 3 minutes. Priced in credits by film length, shown before you start.' },
      { q: 'How do I get my own videos edited?', a: 'In the Agent chat: + button → upload videos for montage. Upload up to 20 videos (20 minutes of footage in total), an optional voiceover, and images or a video as a motion-graphics style reference. The Agent understands each scene, proposes a plan and a price, and starts after you approve. Uploads are kept for 3 hours only. Pricing starts at about 2 credits and grows with length (about 4 credits per minute).' },
      { q: 'Does every montage look the same?', a: 'No — it follows your plan and mood: transitions only in your order, scenes synced to your voiceover for a story, a creator-style edit with lots of graphics and punch-ins, or a calm pace. You can set the sound-effects level (none, light, normal, heavy) and music (added only if you agree). Tell it what you have in mind and the Agent picks the rest.' },
      { q: 'What are the 3D motion scenes in a montage?', a: 'When someone talks to the camera, the Agent separates the audio and replaces 2–8 moments of the footage with code-made 3D motion-graphics scenes about what is being said (headline, keywords, list, number, comparison). Your original audio keeps playing without a cut, the footage comes back afterwards, and captions pause during the scene. It needs clear speech, and it is not applied in transitions-only mode or if you decline it.' },
      { q: 'Can I upload an image or video of a motion-graphics style and get the same look?', a: 'Yes. An image is used automatically as a reference for colours and the closest graphic type. A video is read by a low-cost video model that sees the motion and transitions (about 1–2 credits per reference video, refunded if the reader could not run). The result is the closest match in our graphics library — colours, types and pace — not an exact copy.' },
      { q: 'What language are the captions in?', a: 'The language actually spoken in the video — it is detected from the audio, so an English video gets English captions even if you chat with the Agent in Arabic.' },
      { q: 'Is there a free montage?', a: 'Yes, once per account: output up to 2 minutes and at most 6 videos, with the Erivion watermark. After that montage uses credits.' },
    ],
  },
  {
    category: '📺 Your YouTube Channels',
    questions: [
      { q: 'What does the My Channels page do?', a: 'You connect your channel through VidIQ and Erivion suggests a video every day based on a real analysis of your channel. You approve the idea, production starts, and you get an email when the idea, thumbnail, title, description and keywords are ready in a project named after the channel.' },
      { q: 'Does Erivion publish to my channel?', a: 'No. Erivion prepares everything and you upload the video to your channel yourself.' },
      { q: 'How is the thumbnail made?', a: 'With AI (Nano Banana 2.1), after researching successful examples in your niche, and it comes with the rest of the YouTube package.' },
    ],
  },
  {
    category: '🛍️ Product Ads',
    questions: [
      { q: 'Can I make an ad for my product from a single photo?', a: 'Yes. Upload the product photo (and an idea if you have one); the Agent recognises the product and proposes an idea and an engine (Wan 3.0, Seedance 2.5 or Gemini Omni Flash 1.1) with built-in voiceover. You choose and approve the plan and price before anything is charged, and music is added only if you agree.' },
      { q: 'What is P-Video Animate?', a: 'Animate an image with a video\'s motion: give it a character image (with its own background) and a video with movement and speech (up to 60 seconds), and the image moves and speaks with the same movements and words. The result happens in the image\'s setting, not the original video\'s — it does not replace a person inside the video. It is available in the Agent chat only (+ → Create video, or just ask the Agent); its per-second price is shown next to it.' },
    ],
  },
  {
    category: '🤝 Team',
    questions: [
      { q: 'Can I share credits with my teammates?', a: 'Yes, from the Team page: invite a member by email, they sign in with their own account and use the team credits. Each member keeps their own plan and permissions, and you can remove anyone at any time.' },
    ],
  },
  {
    category: '🎭 Character Studio',
    questions: [
      { q: 'What is the Character Studio?', a: 'The "My Characters" page: register your character or face (or a cartoon/mascot) with a single image and it stays saved. Then use it in any video or image you make from the Agent chat (+ button → My characters) without uploading the picture each time, and the Agent keeps the same look. There are also ready-made characters we add that you can save to your own list. If you do not choose an engine yourself, videos with a character are made automatically with Seedance 2.5, Wan 3.0 or Gemini Omni Flash 1.1, and the Agent tells you the engine and its price before it starts.' },
      { q: 'What are trend templates?', a: 'Ready-made trending videos (dance, comedy, cinematic...). Pick a template and add your own character or face — the person in the template video is replaced by your character while the template\'s place, movement and sound stay the same (using Wan 2.2 Animate Replace, or Seedance 2.5 when the template changes the look, such as hair colour or muscles). The price is shown on each template based on its length and quality (720p or 1080p), charged when you start and refunded if generation fails.' },
      { q: "I don't have a photo — can I create a character with AI?", a: 'Yes. In "Add character" choose "Create with AI", describe the character (age, hair, skin, features), pick a look (realistic, 3D cartoon, anime, illustration) and how many options you want (1, 2 or 4). It is generated with Nano Banana 2.1 as a full-body picture so it works well as a reference in videos, and it is shown to you as the face only. The price is shown before you start and refunded if generation fails, and you pick the one you like and save it. Please do not name celebrities or real people.' },
      { q: 'Can I swap the character in a video I filmed?', a: 'Yes, in two ways. In the Agent chat upload your video and a character image — or pick a saved character from + → My characters — and say what you want: (1) "make this character act like my video": the character moves and speaks like the video with the original voice, but in its own image\'s setting, not the video\'s place (P-Video Animate, up to 60 seconds). (2) "replace the person in my video and keep the place": you choose among four models — Wan 2.2 Animate Replace (cheapest), P-Video Replace, or Kling 3.0 Omni (video of 3 to 10 seconds only) when the video has one person (up to 30 seconds, they keep the place and the video\'s original audio), or Seedance 2.5 for several people or a look change (approximate, new voices, higher price). The Agent shows all four with their real prices and lets you pick. The Agent asks if it is unclear and tells you the price first. The Agent tells you the price, based on the video length, before it starts. Use photos of yourself, characters you created, or people who agreed — we do not accept swaps with a celebrity or a real person without their consent.' },
      { q: 'My video has several people and I want to swap all of them — is that possible?', a: 'P-Video Animate animates a single image and does not keep the video\'s scene, so to replace two or more people in the video\'s own scene, upload one image per character and say who replaces whom (for example "the one on the left gets the first image, the one on the right the second"). The Agent then uses Seedance 2.5 and sends it your video as a reference together with the images. The limits are stated before it starts: the video must be 30 seconds or less, the movements come out very close but not frame-exact, the voices and words are generated again (not the original recording), and it costs more because a reference video raises the price (roughly 4x per second) — the real price is shown before you start. If the video has just one person, Wan 2.2 Animate Replace is more accurate, cheaper and keeps the original audio. If you want one character to move and speak like the video without staying in its place, use P-Video Animate.' },
      { q: 'What kind of photo gives the best result?', a: 'A clear face looking at the camera, good light, and only one person in the picture. We read the character\'s appearance (face, hair...) automatically and use it in the video description so the look stays consistent.' },
    ],
  },
  {
    category: '💳 Subscription & Payment',
    questions: [
      { q: 'How do credits work?', a: 'One credit balance works across every model — you top up once and the balance stays in your account, no weekly expiry or reset.' },
      { q: 'How do I pay if I\'m in Egypt?', a: 'Pick how many credits you want, transfer the amount via InstaPay to the site\'s number, upload a screenshot of the receipt, and tap "I\'ve Paid" — the Erivion team reviews it within 24 hours and activates your credits.' },
      { q: 'How do I pay if I\'m outside Egypt?', a: 'Choose the package that fits, pay directly by card via Gumroad, then click "I\'ve Paid" — activation follows after review.' },
      { q: 'Is there a refund?', a: "Egypt (InstaPay): you can request a refund only within 4 hours of the payment being approved. After that, no refunds except for a confirmed technical failure on our side — not liking the video's style isn't a valid reason. Full details are on the Refund Policy page." },
      { q: 'Are there discounts on the packages?', a: 'Periodic discounts on Egyptian packages show up on the Pricing page, and the price shown after the discount is what you pay. If you started paying before the discount renewed, we honour the discounted price you entered with.' },
    ],
  },
  {
    category: '🎬 Models & Videos',
    questions: [
      { q: "What's the difference between the models, and can I pick one myself?", a: "The Agent picks the best engine for each scene automatically and tells you the price before it starts, and you can also pick yourself from the + button next to the chat → Create video or Create image — every model is listed with its credit price per second.\nExamples: Veo, Kling, Seedance, Wan and Luma to animate video; Nano Banana and Seedream for images; P-Video Animate to move a video's movement and speech onto a new character; Gemini Omni Flash to edit an existing video. If a scene needs dialogue or on-screen text to render clearly, the Agent picks a suitable engine." },
      { q: 'Can I edit a video I already generated?', a: "Yes — just tell the Agent you want to change something in a video you already made (like the scene's mood or a specific detail) instead of generating it from scratch. The source video's real length automatically determines which engine is used for the edit." },
      { q: 'How long does rendering take?', a: "From under a minute to a few minutes depending on video length and model. If it's taking a while, check the \"My Videos\" page — it'll be there even if you closed the screen." },
      { q: 'Can I upload a ready-made script or voice recording?', a: "Yes — you can paste a full script (even scene-by-scene) or upload a voice recording and it becomes the video's actual narration." },
    ],
  },
  {
    category: '🎓 Courses',
    questions: [
      { q: 'Are there courses to learn video creation on Erivion?', a: 'Yes — the Courses page has a free intro video for everyone and courses that are either free or for subscribers (customers who bought credits). Each course has video lessons and attachments, and we keep adding more.' },
    ],
  },
  {
    category: '⚙️ Technical Issues',
    questions: [
      { q: 'My video stopped rendering and showed an error', a: "First check \"My Videos\" — it may have completed. In case of complete failure, contact support and we'll restore your credits." },
      { q: "I can't log in", a: 'Make sure your email is verified (check Spam). For other issues, contact support.' },
      { q: 'The Agent cannot see the videos I uploaded for montage', a: 'Montage uploads are kept for 3 hours only. If that time passed, upload them again. If you get an empty reply, or nothing starts after "start", send the message again — nothing is charged unless the montage really starts.' },
    ],
  },
  {
    category: '🤝 Affiliate Program',
    questions: [
      { q: 'What is the affiliate program?', a: 'You earn a 20% commission on every credit purchase that comes through your referral link, paid straight to your InstaPay.' },
      { q: 'How do I get my referral link?', a: 'Go to "Earn with Erivion" from the side menu. Your personal link is there and you can copy and share it directly.' },
    ],
  },
];

const ICONS = { '🌟': Sparkles, '🤖': Bot, '🎞️': Clapperboard, '📺': Tv, '🛍️': ShoppingBag, '💳': CreditCard, '🎬': Film, '🎓': GraduationCap, '⚙️': Wrench };
// ترتيب العرض: من الأهم للعميل الجديد لحد الدعم الفني
const ORDER = ['عن Erivion|About', 'الايجنت|Agent', 'الأفلام الوثائقية|Documentaries', 'استوديو الشخصيات|Character Studio', 'إعلانات|Ads', 'قنواتك|Channels', 'الموديلات|Models', 'الاشتراك|Subscription', 'الفريق|Team', 'الكورسات|Courses', 'مشاكل|Technical', 'الشراكة|Affiliate'];
const rank = (title) => { const i = ORDER.findIndex(k => k.split('|').some(w => title.includes(w))); return i < 0 ? 99 : i; };
const catMeta = (category) => {
  const m = /^(\S+)\s+(.*)$/.exec(category) || [null, '', category];
  const title = m[2];
  const Icon = /الفريق|Team/.test(title) ? Users : /الشراكة|Affiliate/.test(title) ? Handshake : (ICONS[m[1]] || HelpCircle);
  return { title, Icon };
};

export default function FAQPage({ onBack, onNavigate }) {
  const region = localStorage.getItem('erivion_region') || 'eg';
  const isAr = region !== 'intl';
  const dir = isAr ? 'rtl' : 'ltr';

  const [openItem, setOpenItem] = useState(null);
  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState('all');

  const cats = useMemo(() => (isAr ? faqs_ar : faqs_en).map((c, i) => ({ ...c, ...catMeta(c.category), id: `c${i}` })).sort((a, b) => rank(a.title) - rank(b.title)), [isAr]);
  const needle = search.trim().toLowerCase();
  const filtered = cats
    .filter(c => activeCat === 'all' || c.id === activeCat)
    .map(c => ({ ...c, questions: c.questions.filter(q => !needle || q.q.toLowerCase().includes(needle) || q.a.toLowerCase().includes(needle)) }))
    .filter(c => c.questions.length > 0);
  const total = cats.reduce((a, c) => a + c.questions.length, 0);

  return (
    <PageShell dir={dir} onBack={onBack} backLabel={isAr ? 'رجوع' : 'Back'} eyebrow={isAr ? 'مركز المساعدة' : 'Help center'} Icon={HelpCircle} accent="#60a5fa"
      title={isAr ? 'الأسئلة الشائعة' : 'Frequently asked questions'}
      subtitle={isAr ? `${total} سؤال عن Erivion — الأفلام الوثائقية والمونتاج والايجنت والقنوات والدفع وغيرهم.` : `${total} answers about Erivion — documentaries, montage, the Agent, channels, payments and more.`} maxWidth={900}>
      <style>{`
        .fq-search{position:relative;margin-bottom:18px}
        .fq-search input{width:100%;box-sizing:border-box;padding:15px 48px;border-radius:16px;border:1px solid var(--border2);background:rgba(255,255,255,.04);color:var(--text);font:inherit;font-size:15px;outline:none;transition:border-color .15s,box-shadow .15s}
        .fq-search input:focus{border-color:var(--pk-accent);box-shadow:0 0 0 4px var(--pk-accent-bg)}
        .fq-search svg.s{position:absolute;top:50%;transform:translateY(-50%);inset-inline-start:16px;color:var(--text2);pointer-events:none}
        .fq-search button{position:absolute;top:50%;transform:translateY(-50%);inset-inline-end:12px;background:rgba(255,255,255,.08);border:none;color:var(--text2);width:28px;height:28px;border-radius:50%;display:grid;place-items:center;cursor:pointer}
        .fq-q{width:100%;display:flex;align-items:center;gap:14px;padding:17px 20px;background:none;border:none;color:var(--text);font:inherit;font-size:15.5px;font-weight:600;line-height:1.6;cursor:pointer;text-align:start}
        .fq-q svg{flex-shrink:0;color:var(--text2);transition:transform .2s}
        .fq-open .fq-q svg{transform:rotate(180deg);color:var(--pk-accent)}
        .fq-a{padding:0 20px 20px;color:var(--text2);font-size:14.5px;line-height:1.95;white-space:pre-line;max-width:72ch}
        .fq-cat-h{display:flex;align-items:center;gap:10px;margin:34px 0 14px;font-size:17px;font-weight:800}
        .fq-cat-h span{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;background:var(--pk-accent-bg)}
      `}</style>

      <div className="fq-search">
        <Search className="s" size={18} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={isAr ? 'ابحث في الأسئلة...' : 'Search the questions...'} aria-label={isAr ? 'بحث' : 'Search'} />
        {search && <button onClick={() => setSearch('')} aria-label="clear"><X size={14} /></button>}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="pk-chip" aria-pressed={activeCat === 'all'} onClick={() => setActiveCat('all')}>{isAr ? 'الكل' : 'All'} <small>{total}</small></button>
        {cats.map(c => <button key={c.id} className="pk-chip" aria-pressed={activeCat === c.id} onClick={() => setActiveCat(c.id)}><c.Icon size={13} /> {c.title} <small>{c.questions.length}</small></button>)}
      </div>

      {filtered.length === 0 && <div style={{ marginTop: 28 }}><Empty Icon={Search}>{isAr ? 'مفيش نتيجة للبحث ده — جرّب كلمة تانية أو كلّم الدعم.' : 'No results — try another word or contact support.'}</Empty></div>}

      {filtered.map(cat => (
        <section key={cat.id}>
          <h2 className="fq-cat-h"><span><cat.Icon size={17} color="var(--pk-accent)" /></span>{cat.title}</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {cat.questions.map((item, qi) => {
              const key = `${cat.id}-${qi}`;
              const open = openItem === key || !!needle;
              return (
                <div key={key} className={`pk-card ${open ? 'fq-open' : 'pk-hover'}`} style={open ? { borderColor: 'var(--pk-accent-line)' } : undefined}>
                  <button className="fq-q" onClick={() => setOpenItem(openItem === key ? null : key)} aria-expanded={open}>
                    <span style={{ flex: 1 }}>{item.q}</span><ChevronDown size={18} />
                  </button>
                  {open && <div className="fq-a">{item.a}</div>}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <section className="pk-card" style={{ marginTop: 44, padding: '26px 24px', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', background: 'linear-gradient(135deg, rgba(96,165,250,.1), rgba(124,106,247,.08))' }}>
        <span style={{ width: 48, height: 48, borderRadius: 15, display: 'grid', placeItems: 'center', background: 'rgba(96,165,250,.16)', flexShrink: 0 }}><MessageCircle size={22} color="#60a5fa" /></span>
        <div style={{ flex: '1 1 240px' }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{isAr ? 'لسه مش لاقي إجابتك؟' : "Didn't find your answer?"}</div>
          <div style={{ color: 'var(--text2)', fontSize: 13.5 }}>{isAr ? 'فريق الدعم جاهز يساعدك.' : 'Our support team is ready to help.'}</div>
        </div>
        <button onClick={() => onNavigate ? onNavigate('support') : (window.location.href = 'mailto:support@erivion.net')}
          style={{ padding: '11px 24px', borderRadius: 999, border: 'none', font: 'inherit', fontWeight: 700, fontSize: 14, color: '#fff', cursor: 'pointer', background: 'linear-gradient(135deg,#60a5fa,#7c6af7)', boxShadow: '0 8px 24px rgba(96,165,250,.25)' }}>
          {isAr ? 'تواصل مع الدعم' : 'Contact support'}
        </button>
      </section>
    </PageShell>
  );
}
