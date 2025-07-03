import { useRouter } from "next/router";
import { posts } from "../../lib/posts";
import Head from "next/head";

export default function BlogPost() {
  const router = useRouter();
  const { slug } = router.query;
  const post = posts.find((p) => p.slug === slug);

  if (!post) return <p className="text-center mt-10">Post not found.</p>;

  return (
    <>
      <Head>
        <title>{post.title} | IELTS Bank</title>
      </Head>
      <main className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold mb-2">{post.title}</h1>
        <p className="text-gray-500 text-sm mb-6">{post.date}</p>
        <article
          className="prose prose-lg max-w-none"
          dangerouslySetInnerHTML={{ __html: post.content }}
        />
      </main>
    </>
  );
}
